// MySQL-based authentication module
import { auth, db } from "./api";

export async function registerUser(
  email: string,
  password: string,
  fullName: string,
  role: string,
  photoURL: string | null = null,
  contact: string,
  farmSize: string,
  farmLocation: string
) {
  try {
    const result = await auth.createUserWithEmailAndPassword(email, password, {
      fullName,
      role,
      photoURL,
      contact,
      farmSize,
      farmLocation
    });

    return { success: true, deviceSerialNumber: result?.deviceSerialNumber || null };
  } catch (error: any) {
    console.error("Registration Error:", error);
    return { success: false, message: formatError(error.code || error.message) };
  }
}

export async function loginUser(email: string, password: string) {
  try {
    const result = await auth.signInWithEmailAndPassword(email, password);
    
    if (result.success && result.user) {
      localStorage.setItem('userRole', result.user.role);
      localStorage.setItem('userName', result.user.fullName);
      localStorage.setItem('userPhoto', result.user.photoURL || '');
      if (result.user.id) {
        localStorage.setItem('userId', String(result.user.id));
      }
      if (result.user.canSell !== undefined) {
        localStorage.setItem('canSell', result.user.canSell ? 'true' : 'false');
      }
      if (result.user.sellerOtp !== undefined) {
        localStorage.setItem('sellerOtp', String(result.user.sellerOtp || ''));
      }
      if (result.user.sellerOtpExpiresAt !== undefined) {
        localStorage.setItem('sellerOtpExpiresAt', String(result.user.sellerOtpExpiresAt || ''));
      }
      return { success: true, role: result.user.role };
    }
    
    return { success: false, message: 'Login failed' };
  } catch (error: any) {
    console.error("Login Error:", error);
    return { success: false, message: formatError(error.code || error.message) };
  }
}

export async function logoutUser() {
  await auth.signOut();
  localStorage.clear();
}

function formatError(code: string) {
  switch (code) {
    case 'api/401': return 'Invalid email or password.';
    case 'api/400': return 'This email is already registered.';
    case 'api/500': return 'Server error. Please try again later.';
    default: 
      if (code?.includes('network') || code?.includes('fetch')) {
        return 'Network error. Please check your connection.';
      }
      return code || 'An unexpected error occurred.';
  }
}

export { auth, db };