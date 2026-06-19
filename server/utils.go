package server

import (
	"io"
	"os"
)

func createFile(path string) (*os.File, error) {
	return os.Create(path)
}

func copyFile(dst *os.File, src io.Reader) (int64, error) {
	return io.Copy(dst, src)
}
