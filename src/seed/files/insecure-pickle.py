import pickle
import yaml
import sqlite3

DB_PASSWORD = "production_db_pass_456"

def load_user_data(raw_bytes):
    # Dangerous: deserializing untrusted data with pickle
    data = pickle.loads(raw_bytes)
    return data

def load_config(config_string):
    # Dangerous: yaml.load without SafeLoader
    config = yaml.load(config_string)
    return config

def connect_db():
    password = "admin_password_789"
    conn = sqlite3.connect(f"host=db.example.com password={password}")
    return conn

def process_upload(file_data):
    obj = pickle.load(file_data)
    return obj
