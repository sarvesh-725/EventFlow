import { useRouter } from "next/router";
import { useTheme } from "@/context/ThemeContext";

function Header() {
    const router = useRouter();
    const { theme, toggleTheme } = useTheme();

    const buttonThemeClasses =
        theme === "dark"
            ? "text-white bg-white/10 hover:bg-white/20 border border-white/30"
            : "text-[color:var(--gray-color)] bg-white/90 hover:bg-white border border-white/70";

    const secondaryButtonClasses =
        theme === "dark"
            ? "text-white bg-white/20 hover:bg-white/30 border border-white/30"
            : "text-[color:var(--gray-color)] bg-white hover:bg-slate-100 border border-white/80";

    return (
        <header className="absolute w-full z-40">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
                <div className="flex items-center justify-between h-20">
                    <div className="flex items-center gap-3 flex-wrap">
                        <button
                            onClick={toggleTheme}
                            className={`text-sm px-4 py-2 rounded-full backdrop-blur-md cursor-pointer transition-all shadow-lg ${buttonThemeClasses}`}
                        >
                            {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
                        </button>
                        <a
                            onClick={() => router.push("/admin/auth")}
                            className="btn-sm text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 cursor-pointer shadow-lg backdrop-blur-sm"
                        >
                            Event Manager
                        </a>
                    </div>
                    <nav className="flex items-center gap-3 flex-wrap justify-end">
                        <a
                            href="/users/signin"
                            className="btn-sm text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg backdrop-blur-sm"
                        >
                            Sign in
                        </a>
                        <a
                            href="/users/signup"
                            className={`btn-sm shadow-lg backdrop-blur-md ${secondaryButtonClasses}`}
                        >
                            Sign up
                        </a>
                    </nav>
                </div>
            </div>
        </header>
    );
}

export default Header;
