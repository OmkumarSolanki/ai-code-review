from dataclasses import dataclass
from typing import Optional
from datetime import datetime


@dataclass
class UserProfile:
    name: str
    email: str
    created_at: datetime

    def display_name(self) -> str:
        return f"{self.name} ({self.email})"


def create_user(name: str, email: str) -> UserProfile:
    """Create a new user profile with validation."""
    if not name or not email:
        raise ValueError("Name and email are required")

    return UserProfile(
        name=name.strip(),
        email=email.lower().strip(),
        created_at=datetime.now(),
    )


def is_valid_email(email: str) -> bool:
    """Basic email validation."""
    return "@" in email and "." in email.split("@")[-1]
