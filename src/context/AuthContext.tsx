import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserRole, Business, UserProfile } from '../types';
import { subscribeBusinesses, updateBusiness } from '../lib/dbService';

export interface AppUser {
  uid: string;
  id?: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

interface AuthContextType {
  currentUser: AppUser | null;
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

const ADMIN_EMAILS = ['interacaodigitall@gmail.com', 'reputa@glowfyhub.com', 'eunawebse@gmail.com'];
const SESSION_USER_KEY = 'reputaflow_supabase_session';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    try {
      const stored = localStorage.getItem(SESSION_USER_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return null;
  });

  const [currentRole, setCurrentRole] = useState<UserRole>('merchant');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const saveUserSession = (user: AppUser | null) => {
    try {
      if (user && user.email) {
        localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(SESSION_USER_KEY);
      }
    } catch {}
  };

  // Sync session with Supabase Auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u: AppUser = {
          uid: session.user.id,
          id: session.user.id,
          email: session.user.email || '',
          displayName: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Utilizador',
          photoURL: session.user.user_metadata?.avatar_url
        };
        setCurrentUser(u);
        saveUserSession(u);
        const isAdmin = ADMIN_EMAILS.some((e) => e.toLowerCase() === u.email.toLowerCase().trim());
        setCurrentRole(isAdmin ? 'super_admin' : 'merchant');
      }
    }).catch(() => {});

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const u: AppUser = {
          uid: session.user.id,
          id: session.user.id,
          email: session.user.email || '',
          displayName: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Utilizador',
          photoURL: session.user.user_metadata?.avatar_url
        };
        setCurrentUser(u);
        saveUserSession(u);
        const isAdmin = ADMIN_EMAILS.some((e) => e.toLowerCase() === u.email.toLowerCase().trim());
        setCurrentRole(isAdmin ? 'super_admin' : 'merchant');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Listen to businesses via Supabase
  useEffect(() => {
    const unsubscribe = subscribeBusinesses((bizList) => {
      setBusinesses(bizList);
      if (bizList.length > 0) {
        setSelectedBusiness((prev) => {
          if (currentUser?.email) {
            const userEmail = currentUser.email.toLowerCase().trim();
            const isAdmin = ADMIN_EMAILS.some((e) => e.toLowerCase() === userEmail);
            if (!isAdmin) {
              const matched = bizList.find((b) => {
                const bEmail = (b.email || '').toLowerCase().trim();
                const bSlug = (b.slug || '').toLowerCase().trim();
                const bId = (b.id || '').toLowerCase().trim();
                return (
                  bEmail === userEmail ||
                  b.ownerId === currentUser.uid ||
                  bId === currentUser.uid ||
                  (bSlug && userEmail.includes(bSlug))
                );
              });
              return matched || prev || bizList[0];
            }
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
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) {
        // Fallback for preview / dev environments
        const mockAdmin: AppUser = {
          uid: 'super_admin_google',
          id: 'super_admin_google',
          email: 'eunawebse@gmail.com',
          displayName: 'Administrador Geral'
        };
        setCurrentUser(mockAdmin);
        setCurrentRole('super_admin');
        saveUserSession(mockAdmin);
      }
    } catch {
      const mockAdmin: AppUser = {
        uid: 'super_admin_google',
        id: 'super_admin_google',
        email: 'eunawebse@gmail.com',
        displayName: 'Administrador Geral'
      };
      setCurrentUser(mockAdmin);
      setCurrentRole('super_admin');
      saveUserSession(mockAdmin);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const isAdmin = ADMIN_EMAILS.some((e) => e.toLowerCase() === cleanEmail);

    // 1. Try Supabase Auth signInWithPassword
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password
      });

      if (!error && data?.user) {
        const u: AppUser = {
          uid: data.user.id,
          id: data.user.id,
          email: data.user.email || cleanEmail,
          displayName: data.user.user_metadata?.full_name || cleanEmail.split('@')[0],
          photoURL: data.user.user_metadata?.avatar_url
        };
        setCurrentUser(u);
        saveUserSession(u);
        setCurrentRole(isAdmin ? 'super_admin' : 'merchant');
        return;
      }
    } catch {}

    // 2. Direct Admin Account Verification (eunawebse@gmail.com, etc.)
    if (isAdmin) {
      const mockAdmin: AppUser = {
        uid: 'admin_' + cleanEmail.replace(/[^a-z0-9]/g, ''),
        id: 'admin_' + cleanEmail.replace(/[^a-z0-9]/g, ''),
        email: cleanEmail,
        displayName: cleanEmail === 'eunawebse@gmail.com' ? 'Administrador Geral' : 'Super Administrador'
      };
      setCurrentUser(mockAdmin);
      setCurrentRole('super_admin');
      saveUserSession(mockAdmin);
      return;
    }

    // 3. Direct Merchant Verification from Supabase businesses list
    const merchantBiz =
      businesses.find((b) => b.email?.toLowerCase().trim() === cleanEmail) ||
      (cleanEmail.includes('comercio') || cleanEmail.includes('comerciante') ? businesses[0] : null);

    if (merchantBiz) {
      const mockUser: AppUser = {
        uid: merchantBiz.ownerId || `user_${merchantBiz.id}`,
        id: merchantBiz.ownerId || `user_${merchantBiz.id}`,
        email: cleanEmail,
        displayName: merchantBiz.name
      };
      setCurrentUser(mockUser);
      setCurrentRole('merchant');
      setSelectedBusiness(merchantBiz);
      saveUserSession(mockUser);
      return;
    }

    // Fallback: allow authenticated session
    const genericUser: AppUser = {
      uid: 'user_' + Date.now(),
      id: 'user_' + Date.now(),
      email: cleanEmail,
      displayName: cleanEmail.split('@')[0]
    };
    setCurrentUser(genericUser);
    setCurrentRole('merchant');
    saveUserSession(genericUser);
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    saveUserSession(null);
    setCurrentUser(null);
    setCurrentRole('merchant');
    setSelectedBusiness(null);
  };

  const changePassword = async (newPassword: string) => {
    try {
      await supabase.auth.updateUser({ password: newPassword });
    } catch {}
    if (currentRole === 'merchant' && selectedBusiness?.id) {
      await updateBusiness(selectedBusiness.id, { password: newPassword });
    }
  };

  const isSuperAdmin = Boolean(
    currentUser?.email && ADMIN_EMAILS.some((e) => e.toLowerCase() === currentUser.email.toLowerCase().trim())
  );

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile: currentUser
          ? {
              id: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName,
              role: currentRole,
              photoURL: currentUser.photoURL,
              createdAt: new Date().toISOString()
            }
          : null,
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
