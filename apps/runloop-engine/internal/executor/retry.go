package executor

import (
	"context"
	"fmt"
	"math"
	"math/rand"
	"time"
)

// RetryPolicy defines retry configuration
type RetryPolicy struct {
	MaxRetries  int           // Maximum number of retry attempts
	InitialDelay time.Duration // Initial delay between retries
	MaxDelay     time.Duration // Maximum delay between retries
	Multiplier   float64       // Exponential backoff multiplier
	Jitter       bool          // Add random jitter to delay
	RetryableErrors []string   // List of error messages that should trigger retry
	NonRetryableErrors []string // List of error messages that should NOT trigger retry
}

// DefaultRetryPolicy returns a default retry policy
func DefaultRetryPolicy() *RetryPolicy {
	return &RetryPolicy{
		MaxRetries:     3,
		InitialDelay:   1 * time.Second,
		MaxDelay:       60 * time.Second,
		Multiplier:     2.0,
		Jitter:         true,
		RetryableErrors: []string{
			"connection refused",
			"connection reset",
			"timeout",
			"temporary",
			"rate limit",
			"too many requests",
			"service unavailable",
			"gateway timeout",
		},
		NonRetryableErrors: []string{
			"unauthorized",
			"forbidden",
			"not found",
			"bad request",
			"invalid",
		},
	}
}

// RetryableFunc is a function that can be retried
type RetryableFunc func() error

// Retry executes a function with retry logic
func Retry(ctx context.Context, policy *RetryPolicy, fn RetryableFunc) error {
	if policy == nil {
		policy = DefaultRetryPolicy()
	}

	var lastErr error
	
	for attempt := 0; attempt <= policy.MaxRetries; attempt++ {
		// Check context cancellation
		select {
		case <-ctx.Done():
			return fmt.Errorf("context cancelled: %w", ctx.Err())
		default:
		}

		// Execute the function
		err := fn()
		if err == nil {
			return nil // Success
		}

		lastErr = err

		// Check if we should retry
		if attempt >= policy.MaxRetries {
			break // No more retries
		}

		if !shouldRetry(err, policy) {
			return err // Non-retryable error
		}

		// Calculate delay
		delay := calculateDelay(attempt, policy)

		// Wait before retry
		select {
		case <-ctx.Done():
			return fmt.Errorf("context cancelled during retry wait: %w", ctx.Err())
		case <-time.After(delay):
			// Continue to next attempt
		}
	}

	return fmt.Errorf("max retries exceeded (%d): %w", policy.MaxRetries, lastErr)
}

// shouldRetry determines if an error should be retried
func shouldRetry(err error, policy *RetryPolicy) bool {
	if err == nil {
		return false
	}

	errStr := err.Error()

	// Check non-retryable errors first (higher priority)
	for _, nonRetryable := range policy.NonRetryableErrors {
		if contains(errStr, nonRetryable) {
			return false
		}
	}

	// Check retryable errors
	for _, retryable := range policy.RetryableErrors {
		if contains(errStr, retryable) {
			return true
		}
	}

	// Default: retry on transient errors
	return true
}

// calculateDelay calculates the delay for a given retry attempt
func calculateDelay(attempt int, policy *RetryPolicy) time.Duration {
	// Calculate exponential delay
	delay := float64(policy.InitialDelay) * math.Pow(policy.Multiplier, float64(attempt))

	// Cap at max delay
	if delay > float64(policy.MaxDelay) {
		delay = float64(policy.MaxDelay)
	}

	// Add jitter (±25%)
	if policy.Jitter {
		jitter := delay * 0.25 * (rand.Float64()*2 - 1)
		delay += jitter
	}

	return time.Duration(delay)
}

// contains checks if a string contains a substring (case-insensitive)
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || 
		len(s) > 0 && len(substr) > 0 && 
		containsIgnoreCase(s, substr))
}

func containsIgnoreCase(s, substr string) bool {
	// Simple case-insensitive contains
	for i := 0; i <= len(s)-len(substr); i++ {
		if equalIgnoreCase(s[i:i+len(substr)], substr) {
			return true
		}
	}
	return false
}

func equalIgnoreCase(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := 0; i < len(a); i++ {
		if toLower(a[i]) != toLower(b[i]) {
			return false
		}
	}
	return true
}

func toLower(c byte) byte {
	if c >= 'A' && c <= 'Z' {
		return c + ('a' - 'A')
	}
	return c
}

// RetryWithResult executes a function that returns a result with retry logic
type RetryableFuncWithResult[T any] func() (T, error)

func RetryWithResult[T any](ctx context.Context, policy *RetryPolicy, fn RetryableFuncWithResult[T]) (T, error) {
	var zero T
	
	if policy == nil {
		policy = DefaultRetryPolicy()
	}

	var lastErr error
	
	for attempt := 0; attempt <= policy.MaxRetries; attempt++ {
		select {
		case <-ctx.Done():
			return zero, fmt.Errorf("context cancelled: %w", ctx.Err())
		default:
		}

		result, err := fn()
		if err == nil {
			return result, nil
		}

		lastErr = err

		if attempt >= policy.MaxRetries {
			break
		}

		if !shouldRetry(err, policy) {
			return zero, err
		}

		delay := calculateDelay(attempt, policy)

		select {
		case <-ctx.Done():
			return zero, fmt.Errorf("context cancelled during retry wait: %w", ctx.Err())
		case <-time.After(delay):
		}
	}

	return zero, fmt.Errorf("max retries exceeded (%d): %w", policy.MaxRetries, lastErr)
}

// LinearRetryPolicy returns a linear backoff retry policy
func LinearRetryPolicy(maxRetries int, delay time.Duration) *RetryPolicy {
	return &RetryPolicy{
		MaxRetries:   maxRetries,
		InitialDelay: delay,
		MaxDelay:     delay,
		Multiplier:   1.0,
		Jitter:       false,
	}
}

// FixedRetryPolicy returns a fixed interval retry policy
func FixedRetryPolicy(maxRetries int, delay time.Duration) *RetryPolicy {
	return LinearRetryPolicy(maxRetries, delay)
}

// AggressiveRetryPolicy returns an aggressive retry policy for critical operations
func AggressiveRetryPolicy() *RetryPolicy {
	return &RetryPolicy{
		MaxRetries:     5,
		InitialDelay:   500 * time.Millisecond,
		MaxDelay:       30 * time.Second,
		Multiplier:     1.5,
		Jitter:         true,
	}
}

// ConservativeRetryPolicy returns a conservative retry policy
func ConservativeRetryPolicy() *RetryPolicy {
	return &RetryPolicy{
		MaxRetries:     2,
		InitialDelay:   5 * time.Second,
		MaxDelay:       5 * time.Minute,
		Multiplier:     2.0,
		Jitter:         false,
	}
}
