package connector

// pickStr returns the first non-empty string value found in `cfg` from the
// given list of candidate keys. Lets a connector accept multiple casings of
// the same field — the flow editor uses camelCase, the connector docs and
// REST examples use snake_case, and tools like the AI assistant generate
// either. Without this we silently misread "webhookUrl" as missing because
// the connector only checked "webhook_url".
//
// Empty strings are skipped so a present-but-empty key falls through to
// the next candidate.
func pickStr(cfg map[string]interface{}, keys ...string) string {
	for _, k := range keys {
		if v, ok := cfg[k].(string); ok && v != "" {
			return v
		}
	}
	return ""
}

// pickAny returns the first non-nil value (any type) for the given keys.
// Useful when the field can be a JSON object or array, e.g. message blocks.
func pickAny(cfg map[string]interface{}, keys ...string) interface{} {
	for _, k := range keys {
		if v, ok := cfg[k]; ok && v != nil {
			return v
		}
	}
	return nil
}

// pickBool returns the first found bool, or def. Honours both casings.
func pickBool(cfg map[string]interface{}, def bool, keys ...string) bool {
	for _, k := range keys {
		if v, ok := cfg[k].(bool); ok {
			return v
		}
	}
	return def
}

// pickInt returns the first found int (also accepts float64 from JSON
// decode and numeric strings), or def.
func pickInt(cfg map[string]interface{}, def int, keys ...string) int {
	for _, k := range keys {
		switch v := cfg[k].(type) {
		case int:
			return v
		case int64:
			return int(v)
		case float64:
			return int(v)
		case string:
			// Accept "30" / "3306" etc.
			n := 0
			for _, c := range v {
				if c < '0' || c > '9' {
					n = -1
					break
				}
				n = n*10 + int(c-'0')
			}
			if n > 0 {
				return n
			}
		}
	}
	return def
}
