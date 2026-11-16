import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { MdEmail, MdLock, MdVisibility, MdVisibilityOff } from "react-icons/md";
import logo from "../assets/logo.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);

    try {
      const result = await login(email, password);

      if (result.success) {
        if (result.isAdmin) {
          toast.success("Welcome Admin!");
          navigate("/adminhome", { replace: true }); // Go to admin home
        } else {
          toast.success("Login successful!");
          navigate("/home", { replace: true }); // Go to user home
        }
      } else {
        toast.error(result.error || "Invalid email or password!");
      }
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Something went wrong!");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-8">
          <img src={logo} alt="Company logo" className="h-16 w-auto object-contain mb-5" />
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight">Data Dash Portal</h1>
          <p className="text-neutral-600 text-sm mt-1">Employee &amp; Admin Login</p>
        </div>

        <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-6 sm:p-8">
          <form onSubmit={handleLogin} className="space-y-5" aria-busy={isLoading}>
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-neutral-900 mb-1.5">
                Email
              </label>
              <div className="relative">
                <MdEmail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 text-lg pointer-events-none" />
                <input
                  type="email"
                  id="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field pl-11"
                  placeholder="Enter your email"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-neutral-900 mb-1.5">
                Password
              </label>
              <div className="relative">
                <MdLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 text-lg pointer-events-none" />
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field pl-11 pr-11"
                  placeholder="Enter your password"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
                >
                  {showPassword ? <MdVisibilityOff size={18} /> : <MdVisibility size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full py-3">
              {isLoading && <span className="spinner" aria-hidden="true" />}
              {isLoading ? "Signing in..." : "Login"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-neutral-500 mt-6">
          Authorised staff only. Contact your administrator if you cannot sign in.
        </p>
      </div>
    </div>
  );
}
