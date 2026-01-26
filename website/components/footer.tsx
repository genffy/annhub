import React from 'react'
import Container from './container'

export default function Footer() {
  return (
    <div className="h-[60px] bg-[#1D2B3A] fixed bottom-0 z-20 w-full flex flex-row items-center justify-evenly">
      <Container>
        <div className="my-10 text-sm text-center text-gray-600 dark:text-gray-400">
          Copyright © {new Date().getFullYear()}. Made with ♥ by{' '}
          <a href="https://madao.tech/" target="_blank" rel="noopener">
            madao.tech.
          </a>{' '}
        </div>
      </Container>
    </div>
  )
}
