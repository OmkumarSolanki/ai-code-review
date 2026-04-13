from flask import Flask, request, jsonify
import sqlite3

SECRET_KEY = "flask-secret-key-hardcoded-123"

app = Flask(__name__)
app.config['SECRET_KEY'] = SECRET_KEY

def get_db():
    return sqlite3.connect('app.db')

@app.route('/users/<user_id>')
def get_user(user_id):
    db = get_db()
    cursor = db.cursor()
    query = f"SELECT * FROM users WHERE id = '{user_id}'"
    cursor.execute(query)
    user = cursor.fetchone()
    return jsonify(user)

@app.route('/search')
def search():
    name = request.args.get('name', '')
    db = get_db()
    cursor = db.cursor()
    cursor.execute(f"SELECT * FROM users WHERE name LIKE '%{name}%'")
    results = cursor.fetchall()
    return jsonify(results)
