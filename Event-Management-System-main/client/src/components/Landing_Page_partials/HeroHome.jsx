import EventsCarousel from "@/components/EventsCarousel";

function HeroHome() {
    return (
        <section className="bg-[color:var(--primary-color)] relative">
            {/* Full-width dynamic slideshow */}
            <div className="pt-20">
                <EventsCarousel />
            </div>
        </section>
    );
}

export default HeroHome;
