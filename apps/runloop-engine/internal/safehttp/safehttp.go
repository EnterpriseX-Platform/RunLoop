// Package safehttp builds HTTP clients for requests whose URL comes from
// user input (the HTTP flow node, the HTTP job, webhook notifications and
// plugin handlers). The dialer refuses connections to cloud-metadata and
// other link-local/loopback addresses, which stops a flow from reading
// instance credentials at http://169.254.169.254/… (SSRF).
//
// The check runs in net.Dialer.Control, i.e. against the IP actually being
// dialed, so DNS rebinding and HTTP redirects to a blocked address are
// caught too — a redirect opens a new connection and is re-checked.
//
// Loopback and link-local are always blocked. Private ranges (RFC1918 /
// unique-local) are blocked only when RUNLOOP_BLOCK_PRIVATE_EGRESS is set,
// because a self-hosted RunLoop often calls internal services on purpose.
package safehttp

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"syscall"
	"time"
)

func blockPrivate() bool {
	v := os.Getenv("RUNLOOP_BLOCK_PRIVATE_EGRESS")
	return v == "1" || v == "true" || v == "TRUE"
}

var privateNets = func() []*net.IPNet {
	var nets []*net.IPNet
	for _, cidr := range []string{"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7"} {
		if _, n, err := net.ParseCIDR(cidr); err == nil {
			nets = append(nets, n)
		}
	}
	return nets
}()

// blocked reports whether dialing ip must be refused.
func blocked(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsUnspecified() || ip.IsInterfaceLocalMulticast() {
		return true // covers 127.0.0.0/8, ::1, 169.254.0.0/16, fe80::/10, 0.0.0.0
	}
	if blockPrivate() {
		for _, n := range privateNets {
			if n.Contains(ip) {
				return true
			}
		}
	}
	return false
}

func control(network, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		host = address
	}
	ip := net.ParseIP(host)
	if blocked(ip) {
		return fmt.Errorf("safehttp: refusing to connect to %s", address)
	}
	return nil
}

// NewClient returns an http.Client with the guarded dialer. When
// followRedirects is false the client stops at the first response.
func NewClient(timeout time.Duration, followRedirects bool) *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second, Control: control}
	transport := &http.Transport{
		DialContext:           dialer.DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
	c := &http.Client{Timeout: timeout, Transport: transport}
	if !followRedirects {
		c.CheckRedirect = func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		}
	}
	return c
}
