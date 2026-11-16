import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { MdAdminPanelSettings, MdLock, MdEmail, MdVisibility, MdVisibilityOff } from "react-icons/md";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

export default function AdminLogin() {
  const { loginAsAdmin } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await loginAsAdmin(formData.email, formData.password);
      
      if (result.success) {
        toast.success("Admin login successful!");
        // Navigate to admin dashboard after successful login
        navigate("/admin-dashboard");
      } else {
        toast.error(result.error || "Login failed");
      }
    } catch (error) {
      toast.error("An error occurred during login");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-50 via-neutral-100 to-neutral-50 p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-neutral-100 to-neutral-100 rounded-full mb-6">
            <MdAdminPanelSettings className="text-neutral-900 text-4xl" />
          </div>
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">Admin Portal</h1>
          <p className="text-neutral-700">Access the management dashboard</p>
        </div>

        {/* Login Form */}
        <div className="bg-white backdrop-blur-lg rounded-2xl p-8 border border-neutral-200 shadow-md">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Admin Email
              </label>
              <div className="relative">
                <MdEmail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-600 text-xl" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full pl-12 pr-4 py-3 bg-white border border-neutral-200 rounded-xl text-neutral-900 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300 focus:border-transparent transition-all"
                  placeholder="Enter admin email"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Password
              </label>
              <div className="relative">
                <MdLock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-600 text-xl" />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full pl-12 pr-12 py-3 bg-white border border-neutral-200 rounded-xl text-neutral-900 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300 focus:border-transparent transition-all"
                  placeholder="Enter password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  {showPassword ? <MdVisibilityOff size={20} /> : <MdVisibility size={20} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gradient-to-r from-neutral-900 to-neutral-900 text-white font-semibold rounded-xl hover:from-neutral-700 hover:to-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-300 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed transform"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-neutral-200 border-t-transparent rounded-full animate-spin mr-2"></div>
                  Authenticating...
                </div>
              ) : (
                "Access Admin Dashboard"
              )}
            </button>
          </form>

        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-neutral-600 text-sm">
            © {new Date().getFullYear()} Data Dash. Admin Portal
          </p>
        </div>
      </div>
    </div>
  );
}
