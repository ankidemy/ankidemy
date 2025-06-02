import { Button } from "@/app/components/core/button";
import Image from "next/image";
import Link from "next/link"

export default function Landing() {
  return (
    <main className="relative w-full h-screen">
        {/* Background Image */}
        <Image
          src="/img/ankidemy_bg.jpeg"
          alt="Visual Hero de Ankidemy"
          fill
          className="object-cover"
          priority
        />

        {/* Overlay */}
        <div className="absolute inset-0 bg-black bg-opacity-50 flex flex-col items-center justify-center px-6 text-center">
          <h1 className="text-white text-5xl md:text-6xl font-bold mb-4">
            Domina las matemáticas con Ankidemy
          </h1>
          <p className="text-white text-lg md:text-xl mb-8 max-w-2xl">
            Disfruta de rutas de aprendizaje personalizadas y repetición espaciada para retener más y mejor.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/register"
              className="bg-orange-500 text-white px-6 py-3 rounded-lg hover:bg-orange-400 transition"
            >
              Regístrate Gratis
            </Link>
            <Link
              href="/login"
              className="border border-white text-white px-6 py-3 rounded-lg hover:bg-white hover:text-black transition"
            >
              Iniciar Sesión
            </Link>
          </div>
        </div>
      </main>
  );
}