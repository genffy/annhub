import React from 'react'
import Container from './container'

export default function Footer() {
  return (
    <div className="min-h-[60px] bg-[#1D2B3A] fixed bottom-0 z-20 w-full flex flex-row items-center justify-evenly">
      <Container>
        <div className="my-4 flex flex-col items-center justify-center gap-2 text-sm text-slate-300 sm:flex-row sm:gap-4">
          <span>
            Copyright © {new Date().getFullYear()}. Made with ♥ by{' '}
          </span>
          <a className="text-slate-100 hover:text-white" href="https://madao.tech/" target="_blank" rel="noopener">
            madao.tech.
          </a>{' '}
          <span className="hidden text-slate-500 sm:inline">|</span>
          <a className="text-slate-100 hover:text-white" href="https://annhub.org/privacy-policy.html">
            Privacy Policy
          </a>
          <span className="hidden text-slate-500 sm:inline">|</span>
          <a className="text-slate-100 hover:text-white" href="https://annhub.org/terms-of-service.html">
            Terms of Service
          </a>
        </div>
      </Container>
    </div>
  )
}
