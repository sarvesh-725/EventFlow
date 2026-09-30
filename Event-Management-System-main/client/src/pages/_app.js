import "@/styles/globals.css";
import "@/styles/Home.css";
import Head from "next/head";
import { ThemeProvider } from "@/context/ThemeContext";

export default function App({ Component, pageProps }) {
    return (
        <ThemeProvider>
            <Head>
                <link rel="shortcut icon" href="/favicon_io/favicon.ico" />
                <title>ZONE</title>
            </Head>
            <Component {...pageProps} />
        </ThemeProvider>
    );
}
