package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// doRequest performs an authenticated HTTP request against the RunLoop API and
// decodes the JSON response into `out` (pass nil to discard the body).
func doRequest(cfg *Config, method, path string, body any, query url.Values, out any) error {
	u, err := url.Parse(cfg.BaseURL)
	if err != nil {
		return err
	}
	u.Path += path
	if len(query) > 0 {
		u.RawQuery = query.Encode()
	}

	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, u.String(), reader)
	if err != nil {
		return err
	}
	headers, err := cfg.AuthHeaders()
	if err != nil && !(method == "POST" && path == "/api/auth/login") {
		return err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("%s %s: %d %s", method, u.Path, resp.StatusCode, string(respBody))
	}
	if out != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, out); err != nil {
			return fmt.Errorf("decode response: %w (body=%s)", err, string(respBody))
		}
	}
	return nil
}

// prettyJSON marshals v with 2-space indent for tidy terminal output.
func prettyJSON(v any) string {
	b, _ := json.MarshalIndent(v, "", "  ")
	return string(b)
}
