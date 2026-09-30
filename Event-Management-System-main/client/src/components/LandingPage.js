import FeaturesZigZag from "@/components/Landing_Page_partials/FeaturesZigZag";
import Header from "@/components/Landing_Page_partials/Header";
import HeroHome from "@/components/Landing_Page_partials/HeroHome";
import LandingPageDevelopers from "@/utils/landing_page_developers";
import React, { useEffect } from "react";

const [feature1, feature2, feature3] = LandingPageDevelopers;

function LandingPage() {
    // run the server when a user enters the site
    const fetchAllEvents = async () => {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/getallevents`
        );
        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}`);
        }
    };

    useEffect(() => {
        fetchAllEvents();
    }, []);

    return (
        <div className="overflow-x-hidden bg-[color:var(--primary-color)] text-[color:var(--gray-color)]">
            <div className="flex flex-col min-h-screen overflow-x-hidden">
                <Header className="overflow-x-hidden" />

                <main className="grow">
                    <HeroHome />
                    <FeaturesZigZag images={[feature1, feature2, feature3]} />
                </main>
            </div>
        </div>
    );
}

export default LandingPage;
