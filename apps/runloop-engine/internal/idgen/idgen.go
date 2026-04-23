package idgen

import (
	cuid2 "github.com/nrednav/cuid2"
)

var generate func() string

func init() {
	var err error
	generate, err = cuid2.Init(cuid2.WithLength(25))
	if err != nil {
		// Fallback to default if custom length fails
		generate = cuid2.Generate
	}
}

// New generates a new cuid2 ID.
func New() string {
	return generate()
}
