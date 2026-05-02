import BrandHeaderArea from '../components/BrandHeaderArea';
import LoginFormCard from '../components/LoginFormCard';
import Link from 'next/link';

function Login() {
  return (
    <>
      <BrandHeaderArea
        title='Sign in'
        subtitle='Welcome back. Provide admin credentials to access dashboard.'
      />

      <LoginFormCard title='Authentication' />

      {/* Footer */}
      <div className='mt-5 flex items-center justify-between'>
        <span className='text-[12px] text-black/50 tracking-wide'>
          No account yet?
        </span>
        <Link
          href='#'
          className='text-[12px] font-semibold tracking-[0.15em] uppercase text-black hover:text-black/60 transition-colors duration-150 border-b border-black/30 hover:border-black/60 pb-px'
        >
          Request Access
        </Link>
      </div>
    </>
  );
}

export default Login;
