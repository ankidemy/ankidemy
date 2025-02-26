import Link from "next/link";
import { Button } from "@/app/components/core/button";

export default function Navbar() {
  return (
    <nav className="bg-white p-4 w-full fixed top-0 left-0 z-50">
      <div className="container mx-auto flex justify-between items-center">
        {/* Logo */}
        <Link href="/">
          <img src="/img/logo.png" alt="Logo" className="h-8" width={130} />
        </Link>

        {/* Navigation Links */}
        <div className="hidden md:flex space-x-6">
          <Link href="/producto" className="text-black hover:text-gray-600">
            Producto
          </Link>
          <Link
            href="/quienes-somos"
            className="text-black hover:text-gray-600"
          >
            ¿Quiénes somos?
          </Link>
          <Link href="/precios" className="text-black hover:text-gray-600">
            Precios
          </Link>
          <Link href="/contacto" className="text-black hover:text-gray-600">
            Contacto
          </Link>
        </div>
        {/* Buttons */}
        <div className="hidden md:flex space-x-4">
          <Button asChild>
            <Link
              href="/register"
              className="bg-orange-500 text-white px-3 py-2 rounded-lg hover:bg-orange-300"
            >
              Registrame gratis
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link
              href="/login"
              className="bg-orange-100 text-orange-600 px-3 py-2 rounded-lg border border-orange-400 hover:bg-orange-300"
            >
              Iniciar sesion
            </Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}