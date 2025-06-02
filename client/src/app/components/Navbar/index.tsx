import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/app/components/core/button'

interface NavbarProps {
  hideAuth?: boolean
  onMenuClick?: () => void
}

export default function Navbar({ hideAuth = false, onMenuClick }: NavbarProps) {
  return (
    <nav className="bg-white p-4 w-full fixed top-0 left-0 z-50">
      <div className="container mx-auto flex justify-between items-center">
        {/* Logo */}
        <Link href="/">
          <Image src="/img/logo.png" alt="Logo" width={130} height={32} />
        </Link>

        {/* Enlaces */}
        <div className="hidden md:flex space-x-6">
          <Link href="/producto" className="text-black hover:text-gray-600">Producto</Link>
          <Link href="/quienes-somos" className="text-black hover:text-gray-600">¿Quiénes somos?</Link>
          <Link href="/precios" className="text-black hover:text-gray-600">Precios</Link>
          <Link href="/contacto" className="text-black hover:text-gray-600">Contacto</Link>
        </div>

        {/* Botón hamburguesa */}
        {onMenuClick && (
          <button onClick={onMenuClick} className="ml-4 p-2">
            <svg
              className="w-6 h-6 text-gray-800"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
      </div>
    </nav>
  )
}
