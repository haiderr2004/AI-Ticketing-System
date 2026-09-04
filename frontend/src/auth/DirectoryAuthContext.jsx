import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clearDirectorySession, getDirectorySession, signInWithDirectory } from './directoryAuth';

const DirectoryAuthContext = createContext(null);

export function DirectoryAuthProvider({ children }) {
  const [identity, setIdentity] = useState(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let active = true;
    getDirectorySession()
      .then((session) => {
        if (active) setIdentity(session);
      })
      .finally(() => {
        if (active) setIsChecking(false);
      });
    return () => { active = false; };
  }, []);

  const value = useMemo(() => ({
    identity,
    isChecking,
    async signIn(credentials) {
      const session = await signInWithDirectory(credentials);
      setIdentity(session);
      return session;
    },
    signOut() {
      clearDirectorySession();
      setIdentity(null);
    },
  }), [identity, isChecking]);

  return <DirectoryAuthContext.Provider value={value}>{children}</DirectoryAuthContext.Provider>;
}

export function useDirectoryAuth() {
  const context = useContext(DirectoryAuthContext);
  if (!context) throw new Error('useDirectoryAuth must be used within DirectoryAuthProvider.');
  return context;
}
