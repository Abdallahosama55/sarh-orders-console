import { zodResolver } from '@hookform/resolvers/zod';
import { loginInputSchema, type LoginInput } from '@orders/shared';
import { useForm } from 'react-hook-form';
import { Navigate, useSearchParams } from 'react-router';
import { Field } from '../components/Field';
import { ApiError, errorMessage } from '../lib/api-client';
import { safeNextPath, useLogin, useSession } from './session';

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const session = useSession();
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: { email: '', password: '' },
  });

  if (session.data) return <Navigate to={safeNextPath(searchParams.get('next'))} replace />;

  const onSubmit = handleSubmit((values) => login.mutate(values));
  const failure =
    login.error instanceof ApiError && login.error.code === 'invalid_credentials'
      ? 'Wrong email or password.'
      : login.error && errorMessage(login.error);

  return (
    <main className="login">
      <form className="login__card" onSubmit={onSubmit} noValidate>
        <p className="login__brand">SARH</p>
        <h1>Orders Console</h1>
        <Field label="Email" error={errors.email?.message}>
          {(control) => (
            <input {...control} type="email" autoComplete="username" {...register('email')} />
          )}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {(control) => (
            <input
              {...control}
              type="password"
              autoComplete="current-password"
              {...register('password')}
            />
          )}
        </Field>
        {failure && (
          <p className="alert alert--error" role="alert">
            {failure}
          </p>
        )}
        <button
          type="submit"
          className="button button--primary button--block"
          disabled={login.isPending}
        >
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
        {import.meta.env.DEV && (
          <p className="login__hint">
            Demo accounts: <code>admin@sarh.test</code> / <code>Admin#2026</code> ·{' '}
            <code>agent@sarh.test</code> / <code>Agent#2026</code>
          </p>
        )}
      </form>
    </main>
  );
}
