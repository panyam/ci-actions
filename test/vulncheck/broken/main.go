// A module whose go.sum lacks the hash for its one dependency, so govulncheck fails to load it,
// as oneauth's modules did at a release tag (oneauth issue 537).
package main

import (
	"fmt"

	"golang.org/x/text/language"
)

func main() { fmt.Println(language.English) }
