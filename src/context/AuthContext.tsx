import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updatePassword
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { UserRole, Business, UserProfile } from '../types';
import { subscribeBusinesses, updateBusiness } from '../lib/dbService';
import { bootstrapSeedData } from '../lib/seed';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  businesses: Business[];
  selectedBusiness: Business | null;
  setSelectedBusiness: (biz: Business | null) => void;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  isSuperAdmin: boolean;
}

const ADMIN_EMAILS = ['interacaodigitall@gmail.com', 'reputa@glowfyhub.com'];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [currentRole, setCurrentRole] = useState<UserRole>('merchant');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);

  // Monitor Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // If email is in admin emails, auto switch to super_admin
        if (user.email && ADMIN_EMAILS.includes(user.email)) {
          setCurrentRole('super_admin');
        } else {
          setCurrentRole('merchant');
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Listen to businesses from Firestore
  useEffect(() => {
    // Initial bootstrap check
    bootstrapSeedData(currentUser?.uid || 'default-owner');

    const unsubscribe = subscribeBusinesses((bizList) => {
      setBusinesses(bizList);
      if (bizList.length > 0) {
        setSelectedBusiness((prev) => {
          if (currentUser?.email && !ADMIN_EMAILS.includes(currentUser.email)) {
            // It's a merchant! Find the exact business belonging to their registered email
            const matched = bizList.find((b) => b.email?.toLowerCase() === currentUser.email?.toLowerCase());
            return matched || null;
          }
          if (!prev) return bizList[0];
          const found = bizList.find((b) => b.id === prev.id);
          return found || bizList[0];
        });
      }
    });

    return () => unsubscribe();
  }, [currentUser]);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Login error:', err);
      throw err;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      // Check if email belongs to a registered merchant with a matching temporary password
      const matchingBiz = businesses.find((b) => b.email?.toLowerCase() === email.toLowerCase());

      if (
        (email === 'reputa@glowfyhub.com' || (matchingBiz && matchingBiz.password === password)) &&
        (err.code === 'auth/user-not-found' ||
          err.code === 'auth/invalid-credential' ||
          err.code === 'auth/invalid-login-credentials' ||
          err.code === 'auth/wrong-password')
      ) {
        try {
          // Auto register this credential on Firebase Auth for immediate seamless access
          await createUserWithEmailAndPassword(auth, email, password);
          return;
        } catch (signUpErr) {
          console.error('Auto register error:', signUpErr);
          throw err;
        }
      }
      console.error('Email sign in error:', err);
      throw err;
    }
  };

  const signOut = async () => {
    try {
      await fbSignOut(auth);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const changePassword = async (newPassword: string) => {
    if (!auth.currentUser) throw new Error('Utilizador não autenticado');
    try {
      await updatePassword(auth.currentUser, newPassword);
      // Synchronize in Firestore businesses if it's a merchant to allow mobile logins too
      if (currentRole === 'merchant' && selectedBusiness?.id) {
        await updateBusiness(selectedBusiness.id, { password: newPassword });
      }
    } catch (err) {
      console.error('Change password error:', err);
      throw err;
    }
  };

  const isSuperAdmin =
    currentRole === 'super_admin' || !!(currentUser?.email && ADMIN_EMAILS.includes(currentUser.email));

  const userProfile: UserProfile = {
    id: currentUser?.uid || 'user-demo',
    email: currentUser?.email || (currentRole === 'super_admin' ? 'reputa@glowfyhub.com' : 'comerciante@reputaflow.com'),
    displayName: currentUser?.displayName || (currentRole === 'super_admin' ? 'Super Administrador' : 'Gestor Comerciante'),
    role: currentRole,
    businessId: selectedBusiness?.id,
    photoURL: currentUser?.photoURL || undefined,
    createdAt: new Date().toISOString()
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        currentRole,
        setCurrentRole,
        businesses,
        selectedBusiness,
        setSelectedBusiness,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signOut,
        changePassword,
        isSuperAdmin
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
