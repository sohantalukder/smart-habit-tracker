import { useMutation } from '@tanstack/react-query';
import { authApi } from '@/api/client';
import { useStore } from '@/state/store';

export function useAuthMutations() {
  const completeAuthentication = useStore(
    (state) => state.completeAuthentication
  );

  const signup = useMutation({
    mutationKey: ['auth', 'signup'],
    mutationFn: authApi.signup,
  });
  const login = useMutation({
    mutationKey: ['auth', 'login'],
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: completeAuthentication,
  });
  const verifyEmail = useMutation({
    mutationKey: ['auth', 'verify-email'],
    mutationFn: ({ email, code }: { email: string; code: string }) =>
      authApi.verifyEmail(email, code),
    onSuccess: completeAuthentication,
  });
  const resendVerification = useMutation({
    mutationKey: ['auth', 'resend-verification'],
    mutationFn: authApi.resend,
  });
  const restoreAccount = useMutation({
    mutationKey: ['auth', 'restore-account'],
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.restore(email, password),
    onSuccess: completeAuthentication,
  });

  return {
    login,
    resendVerification,
    restoreAccount,
    signup,
    verifyEmail,
  };
}
