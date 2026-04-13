import java.util.Objects;

public class UserProfile {
    private final String name;
    private final String email;

    public UserProfile(String name, String email) {
        this.name = Objects.requireNonNull(name, "Name cannot be null");
        this.email = Objects.requireNonNull(email, "Email cannot be null");
    }

    public String getName() {
        return name;
    }

    public String getEmail() {
        return email;
    }

    public String getDisplayName() {
        return name + " (" + email + ")";
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof UserProfile)) return false;
        UserProfile that = (UserProfile) o;
        return name.equals(that.name) && email.equals(that.email);
    }

    @Override
    public int hashCode() {
        return Objects.hash(name, email);
    }
}
