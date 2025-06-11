"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { registerUser, checkAuthStatus } from "@/lib/api";
import { Eye, EyeOff, ArrowLeft, AlertCircle, CheckCircle } from "lucide-react";

// Validation functions
const validateEmail = (email: string): string | null => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) return "Email is required";
  if (!emailRegex.test(email)) return "Please enter a valid email address";
  return null;
};

const validatePassword = (password: string): string | null => {
  if (!password) return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters long";
  return null;
};

const validateUsername = (username: string): string | null => {
  if (!username) return "Username is required";
  if (username.length < 3) return "Username must be at least 3 characters long";
  if (username.length > 50) return "Username must be less than 50 characters";
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return "Username can only contain letters, numbers, and underscores";
  return null;
};

// Helper function to parse backend validation errors
const parseBackendError = (error: string): string => {
  // Handle specific backend validation errors
  if (error.includes("Password") && error.includes("min")) {
    return "Password must be at least 8 characters long";
  }
  if (error.includes("Email") && error.includes("email")) {
    return "Please enter a valid email address";
  }
  if (error.includes("Username") && error.includes("min")) {
    return "Username must be at least 3 characters long";
  }
  if (error.includes("already exists") || error.includes("already in use")) {
    return "This email or username is already registered";
  }
  if (error.includes("Conflict")) {
    return "An account with this email or username already exists";
  }
  
  // Return a user-friendly version of the error
  return "Registration failed. Please check your information and try again.";
};

export default function ImprovedRegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    username: "",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });
  
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check if user is already authenticated on component mount
  useEffect(() => {
    const checkExistingAuth = async () => {
      try {
        const authStatus = await checkAuthStatus();
        if (authStatus.isAuthenticated) {
          console.log("User already authenticated, redirecting to dashboard");
          router.push("/dashboard");
          return;
        }
      } catch (error) {
        console.log("No existing authentication found");
        // User is not authenticated, continue with register page
      } finally {
        setCheckingAuth(false);
      }
    };

    checkExistingAuth();
  }, [router]);

  const togglePasswordVisibility = () => {
    setPasswordVisible(!passwordVisible);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear field error when user starts typing
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({ ...prev, [field]: "" }));
    }
    
    // Clear general error when user starts typing
    if (error) {
      setError(null);
    }
    
    // Clear success message when user starts typing
    if (success) {
      setSuccess(null);
    }
  };

  const handleBlur = (field: string) => {
    setTouchedFields(prev => ({ ...prev, [field]: true }));
    validateField(field, formData[field as keyof typeof formData]);
  };

  const validateField = (field: string, value: string) => {
    let fieldError = "";
    
    switch (field) {
      case "username":
        fieldError = validateUsername(value) || "";
        break;
      case "email":
        fieldError = validateEmail(value) || "";
        break;
      case "password":
        fieldError = validatePassword(value) || "";
        break;
    }
    
    setFieldErrors(prev => ({ ...prev, [field]: fieldError }));
    return fieldError === "";
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    const usernameError = validateUsername(formData.username);
    const emailError = validateEmail(formData.email);
    const passwordError = validatePassword(formData.password);
    
    if (usernameError) errors.username = usernameError;
    if (emailError) errors.email = emailError;
    if (passwordError) errors.password = passwordError;
    
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    
    // Mark all fields as touched
    setTouchedFields({
      username: true,
      email: true,
      password: true,
    });
    
    // Validate form
    if (!validateForm()) {
      return;
    }
    
    setIsLoading(true);

    try {
      await registerUser({
        username: formData.username,
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName || undefined,
        lastName: formData.lastName || undefined,
      });

      setSuccess("Registration successful! Redirecting to dashboard...");
      
      // Short delay to show success message before redirecting
      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
      
    } catch (err: any) {
      const errorMessage = parseBackendError(err.message || "Registration failed. Please try again.");
      setError(errorMessage);
      console.error("Registration error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const isFormValid = () => {
    return formData.username && 
           formData.email && 
           formData.password && 
           Object.values(fieldErrors).every(error => error === "");
  };

  // Show loading spinner while checking authentication
  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6 flex justify-stretch items-stretch min-h-screen bg-gray-50">
      <div className="bg-white flex flex-grow rounded-lg shadow-xl overflow-hidden">
        {/* Image */}
        <div className="w-3/5 flex items-center justify-between gap-7">
          <div className="w-full relative min-h-full">
            <Image
              src="/img/register.jpeg"
              alt="Decorative"
              fill
              className="flex items-center w-full object-cover content-start rounded-2xl"
            />
          </div>
        </div>

        {/* Registration Form */}
        <div className="w-2/5 flex flex-col p-8 relative">
          <div className="flex flex-col justify-center h-full max-w-md mx-auto w-full">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-extrabold text-orange-500 mb-2">
                Registrar
              </h2>
              <p className="text-gray-600">Create your account to get started</p>
            </div>

            <div className="space-y-6">
              {/* Username Field */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  Username *
                </label>
                <input
                  id="username"
                  type="text"
                  className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                    fieldErrors.username && touchedFields.username
                      ? "border-red-300 focus:border-red-500"
                      : "border-gray-300 focus:border-orange-500"
                  }`}
                  placeholder="Enter your username"
                  value={formData.username}
                  onChange={(e) => handleInputChange("username", e.target.value)}
                  onBlur={() => handleBlur("username")}
                  onKeyPress={handleKeyPress}
                />
                {fieldErrors.username && touchedFields.username && (
                  <div className="mt-1 flex items-center text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {fieldErrors.username}
                  </div>
                )}
              </div>

              {/* Name Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                    First Name
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="First name"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange("firstName", e.target.value)}
                    onKeyPress={handleKeyPress}
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="Last name"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange("lastName", e.target.value)}
                    onKeyPress={handleKeyPress}
                  />
                </div>
              </div>

              {/* Email Field */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address *
                </label>
                <input
                  id="email"
                  type="email"
                  className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                    fieldErrors.email && touchedFields.email
                      ? "border-red-300 focus:border-red-500"
                      : "border-gray-300 focus:border-orange-500"
                  }`}
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  onBlur={() => handleBlur("email")}
                  onKeyPress={handleKeyPress}
                />
                {fieldErrors.email && touchedFields.email && (
                  <div className="mt-1 flex items-center text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {fieldErrors.email}
                  </div>
                )}
              </div>

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password *
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={passwordVisible ? "text" : "password"}
                    className={`w-full px-3 py-2 pr-10 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                      fieldErrors.password && touchedFields.password
                        ? "border-red-300 focus:border-red-500"
                        : "border-gray-300 focus:border-orange-500"
                    }`}
                    placeholder="Minimum 8 characters"
                    value={formData.password}
                    onChange={(e) => handleInputChange("password", e.target.value)}
                    onBlur={() => handleBlur("password")}
                    onKeyPress={handleKeyPress}
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                  >
                    {passwordVisible ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {fieldErrors.password && touchedFields.password && (
                  <div className="mt-1 flex items-center text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {fieldErrors.password}
                  </div>
                )}
                {formData.password && !fieldErrors.password && formData.password.length >= 8 && (
                  <div className="mt-1 flex items-center text-sm text-green-600">
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Password meets requirements
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={isLoading || !isFormValid()}
                className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? "Creating Account..." : "Create Account"}
              </button>

              {/* Error Message */}
              {error && (
                <div className="rounded-md bg-red-50 border border-red-200 p-4">
                  <div className="flex items-start">
                    <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-medium text-red-800">
                        Registration Failed
                      </h3>
                      <div className="mt-1 text-sm text-red-700">
                        {error}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Success Message */}
              {success && (
                <div className="rounded-md bg-green-50 border border-green-200 p-4">
                  <div className="flex items-start">
                    <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 mr-3 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-medium text-green-800">
                        Registration Successful!
                      </h3>
                      <div className="mt-1 text-sm text-green-700">
                        {success}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Login Link */}
              <div className="text-center">
                <span className="text-sm text-gray-600">
                  Already have an account?{" "}
                  <Link href="/login" className="font-medium text-orange-600 hover:text-orange-500">
                    Sign in
                  </Link>
                </span>
              </div>
            </div>
          </div>

          {/* Back Button */}
          <div className="absolute bottom-6 left-6">
            <Link href="/" className="flex items-center text-gray-600 hover:text-gray-800 transition-colors">
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
