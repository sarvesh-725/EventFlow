import { normalizeImagePath } from "@/utils/normalizeImagePath";
import { useTheme } from "@/context/ThemeContext";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

function EventsCarousel() {
    const [events, setEvents] = useState([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const router = useRouter();
    const { theme } = useTheme();

    useEffect(() => {
        const fetchEvents = async () => {
            try {
                const response = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL}/getallevents`
                );
                if (!response.ok) return;
                const data = await response.json();
                // Filter out events without event_id and show top 6
                const validEvents = data
                    .filter((event) => event.event_id && event.event_id !== "undefined")
                    .slice(0, 6);
                setEvents(validEvents);
            } catch (e) {
                console.error("Error loading events for carousel", e);
            }
        };
        fetchEvents();
    }, []);

    useEffect(() => {
        if (!events.length) return;
        const id = setInterval(() => {
            setActiveIndex((prev) => (prev + 1) % events.length);
        }, 5000);
        return () => clearInterval(id);
    }, [events]);

    if (!events.length) return null;

    const active = events[activeIndex];

    const titleTextClass =
        theme === "dark" ? "text-white" : "text-[color:var(--gray-color)]";
    const bodyTextClass =
        theme === "dark" ? "text-gray-200" : "text-[color:var(--light-gray)]";

    return (
        <div className="relative w-full">
            {/* Full-width dark gradient background */}
            <div className="relative w-full h-[60vh] min-h-[520px] md:h-[70vh] overflow-hidden bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900">
                {/* Animated gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-pink-600/20 animate-pulse"></div>
                
                {/* Event slides */}
                <div className="relative h-full">
                    {events.map((event, idx) => (
                        <div
                            key={event.event_id}
                            className={`absolute inset-0 transition-all duration-1000 ease-in-out ${
                                idx === activeIndex
                                    ? "opacity-100 scale-100 z-10"
                                    : "opacity-0 scale-95 z-0"
                            }`}
                        >
                            <div className="relative h-full w-full">
                                {/* Background image with overlay */}
                                {event.cover && (
                                    <div className="absolute inset-0">
                                        <Image
                                            src={normalizeImagePath(event.cover)}
                                            alt={event.name}
                                            fill
                                            className="object-cover"
                                            sizes="100vw"
                                            priority={idx === activeIndex}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/70 to-transparent"></div>
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent"></div>
                                    </div>
                                )}
                                
                                {/* Content overlay - centered */}
                                <div className="relative h-full flex items-center justify-center">
                                    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex justify-center">
                                        <div className="max-w-4xl w-full flex flex-col gap-6 text-white text-center md:text-left">
                                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 md:gap-0">
                                                <span className="inline-flex items-center justify-center md:justify-start gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white text-xs font-semibold uppercase tracking-widest rounded-full shadow-lg w-fit mx-auto md:mx-0">
                                                    <span className="w-2 h-2 bg-white rounded-full animate-ping"></span>
                                                    Now Showing
                                                </span>
                                                <div className="flex items-center justify-center md:justify-end gap-2 text-xs uppercase tracking-widest text-white/70">
                                                    <span>Swipe</span>
                                                    <div className="flex gap-2">
                                                        {events.map((_, dotIdx) => (
                                                            <button
                                                                key={dotIdx}
                                                                onClick={() => setActiveIndex(dotIdx)}
                                                                className={`rounded-full transition-all duration-300 ${
                                                                    dotIdx === activeIndex
                                                                        ? "w-10 h-2 bg-gradient-to-r from-blue-400 to-purple-400 shadow-lg"
                                                                        : "w-2 h-2 bg-white/40 hover:bg-white/70"
                                                                }`}
                                                                aria-label={`Go to slide ${dotIdx + 1}`}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="text-center md:text-left">
                                                <h2 className={`text-4xl md:text-5xl lg:text-6xl font-bold mb-4 leading-tight drop-shadow-2xl ${titleTextClass}`}>
                                                    {event.name}
                                                </h2>
                                                <p className={`text-lg md:text-xl mb-2 line-clamp-2 drop-shadow-lg ${bodyTextClass}`}>
                                                    {event.description}
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm md:text-base max-w-2xl mx-auto md:mx-0">
                                                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 shadow-lg">
                                                    <p className="text-white/70 text-xs uppercase tracking-widest mb-1">
                                                        When
                                                    </p>
                                                    <p className="font-semibold text-white">
                                                        {event.date}
                                                    </p>
                                                    <p className="text-white/80">{event.time}</p>
                                                </div>
                                                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 shadow-lg">
                                                    <p className="text-white/70 text-xs uppercase tracking-widest mb-1">
                                                        Where
                                                    </p>
                                                    <p className="font-semibold text-white">
                                                        {event.venue}
                                                    </p>
                                                </div>
                                                <div className="bg-gradient-to-r from-emerald-500 to-green-500 rounded-2xl p-4 shadow-2xl">
                                                    <p className="text-white/80 text-xs uppercase tracking-widest mb-1">
                                                        Starting at
                                                    </p>
                                                    <p className="font-bold text-2xl text-white">
                                                        ₹ {event.price}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-4">
                                                <button
                                                    onClick={() => router.push(`/event/${event.event_id}`)}
                                                    className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-bold rounded-2xl shadow-2xl transform hover:scale-105 transition-all duration-300"
                                                >
                                                    Book Now
                                                </button>
                                                <button
                                                    onClick={() => router.push(`/event/${event.event_id}`)}
                                                    className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-2xl border border-white/40 shadow-lg backdrop-blur-md transition-all duration-300"
                                                >
                                                    View Details
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Navigation arrows */}
                <button
                    onClick={() => setActiveIndex((prev) => (prev - 1 + events.length) % events.length)}
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 z-20 w-12 h-12 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-all duration-300 hover:scale-110"
                    aria-label="Previous slide"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <button
                    onClick={() => setActiveIndex((prev) => (prev + 1) % events.length)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 z-20 w-12 h-12 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-all duration-300 hover:scale-110"
                    aria-label="Next slide"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>
        </div>
    );
}

export default EventsCarousel;


