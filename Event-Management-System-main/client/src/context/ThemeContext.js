import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext({
    theme: "light",
    toggleTheme: () => {},
});

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState("light");

    useEffect(() => {
        if (typeof window === "undefined") return;

        const stored = window.localStorage.getItem("theme");
        const prefersDark = window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches;

        const initial = stored || (prefersDark ? "dark" : "light");
        setTheme(initial);
        document.documentElement.setAttribute("data-theme", initial);
    }, []);

    const toggleTheme = () => {
        setTheme((prev) => {
            const next = prev === "dark" ? "light" : "dark";
            if (typeof window !== "undefined") {
                window.localStorage.setItem("theme", next);
            }
            document.documentElement.setAttribute("data-theme", next);
            return next;
        });
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}


