"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const router = useRouter();

  const [hasError, setHasError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();

    // Dummy validation: replace with actual logic
    const isValid = false; // Simulate validation failure

    if (!isValid) {
      setHasError(true);
    } else {
      setHasError(false);
      // Proceed with successful login actions
    }
  };

  return (
    <div className="p-6 flex justify-stretch items-stretch h-screen">
      <div className="bg-white flex flex-grow">
        {/* Imagen */}
        <div className="w-3/5 flex items-center justify-between gap-7">
          <div className="w-full relative min-h-full">
            <Image
              src="/img/login.jpeg"
              alt="Decorative"
              fill
              className="flex items-center w-full object-cover content-start rounded-2xl"
            />
          </div>
        </div>

        {/* Login */}
        <div className="w-2/5 flex flex-col p-4">
          <div className="flex flex-col items-center justify-between h-full">
            {/* Container of Form and Return button */}
            <div className="flex w-full h-full justify-center items-center">
              <div className="flex flex-col items-center justify-center max-w-md w-full space-y-8 p-10">
                <h2 className="text-center text-5xl font-extrabold text-orange-500">
                  Ankidemy
                </h2>
                <form className="mt-8 space-y-6 w-full">
                  <input type="hidden" name="remember" value="true" />
                  <div className="rounded-md -space-y-px">
                    <div className="mb-6">
                      <label htmlFor="email_id" className="sr-only">
                        Email address
                      </label>
                      <input
                        id="email_id"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-gray-500 focus:border-gray-500 focus:z-10 sm:text-sm"
                        placeholder="Email address"
                      />
                    </div>
                    <div>
                      <label htmlFor="password" className="sr-only">
                        Password
                      </label>
                      <input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-gray-500 focus:border-gray-500 focus:z-10 sm:text-sm"
                        placeholder="Password"
                      />
                    </div>
                  </div>

                  <div>
                    <button
                      type="submit"
                      className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-orange-400 hover:bg-orange-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                    >
                      Iniciar sesion
                    </button>
                  </div>

                  {/* Contrasena olvidada */}
                  <div className="text-sm text-center">
                    <Link
                      href="/forgot-password"
                      className="font-medium text-gray-800 hover:text-gray-600"
                    >
                      Olvidaste tu contraseña?
                    </Link>
                  </div>
                </form>
              </div>
            </div>
            {/* Regresar */}
            <div className="absolute text-center bottom-10">
              <span
                onClick={() => router.back()}
                className="text-black px-3 py-2 hover:text-gray-600 cursor-pointer"
              >
                <span className="text-2xl mr-2">&larr;</span> Regresar
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}