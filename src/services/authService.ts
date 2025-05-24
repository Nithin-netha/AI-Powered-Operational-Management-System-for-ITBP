import { signUp, signIn, signOut, getCurrentUser } from 'aws-amplify/auth';
import { updatePassword, resetPassword } from 'aws-amplify/auth';

export interface UserAttributes {
    username: string;
    password: string;
    email?: string;
    rank?: string;
    unit?: string;
}

class AuthService {
    // Sign up a new user
    async signUp(userAttributes: UserAttributes) {
        try {
            const result = await signUp({
                username: userAttributes.username,
                password: userAttributes.password,
                options: {
                    userAttributes: {
                        email: userAttributes.email,
                        'custom:rank': userAttributes.rank,
                        'custom:unit': userAttributes.unit
                    }
                }
            });
            return result;
        } catch (error) {
            console.error('Error signing up:', error);
            throw error;
        }
    }

    // Sign in a user
    async signIn(username: string, password: string) {
        try {
            const user = await signIn({ username, password });
            return user;
        } catch (error) {
            console.error('Error signing in:', error);
            throw error;
        }
    }

    // Sign out a user
    async signOut() {
        try {
            await signOut();
        } catch (error) {
            console.error('Error signing out:', error);
            throw error;
        }
    }

    // Get current authenticated user
    async getCurrentUser() {
        try {
            const user = await getCurrentUser();
            return user;
        } catch (error) {
            console.error('Error getting current user:', error);
            return null;
        }
    }

    // Change password
    async changePassword(oldPassword: string, newPassword: string) {
        try {
            await updatePassword({ oldPassword, newPassword });
        } catch (error) {
            console.error('Error changing password:', error);
            throw error;
        }
    }

    // Reset password
    async forgotPassword(username: string) {
        try {
            await resetPassword({ username });
        } catch (error) {
            console.error('Error initiating password reset:', error);
            throw error;
        }
    }
}

export const authService = new AuthService(); 