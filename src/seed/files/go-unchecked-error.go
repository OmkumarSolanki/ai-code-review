package main

import (
	"database/sql"
	"fmt"
	"os"
)

const API_KEY = "sk-live-hardcoded-api-key-12345"

func readFile(path string) string {
	data, _ := os.ReadFile(path)
	return string(data)
}

func queryUser(db *sql.DB, userId string) *sql.Row {
	query := fmt.Sprintf("SELECT * FROM users WHERE id = '%s'", userId)
	return db.QueryRow(query)
}

func writeFile(path string, content string) {
	os.WriteFile(path, []byte(content), 0644)
}

func closeDB(db *sql.DB) {
	db.Close()
}

func main() {
	fmt.Println("Running with API key:", API_KEY)
}
