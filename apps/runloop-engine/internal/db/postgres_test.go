package db

import (
	"math"
	"testing"
)

// clampInt32 keeps pgxpool's int32 fields safe from out-of-range int values
// coming out of the env-var config.

func TestClampInt32(t *testing.T) {
	cases := []struct {
		in   int
		want int32
	}{
		{0, 0},
		{-1, 0},
		{math.MinInt32, 0},
		{1, 1},
		{200, 200},
		{math.MaxInt32, math.MaxInt32},
		{math.MaxInt32 + 1, math.MaxInt32},
	}
	for _, c := range cases {
		if got := clampInt32(c.in); got != c.want {
			t.Errorf("clampInt32(%d) = %d, want %d", c.in, got, c.want)
		}
	}
}
