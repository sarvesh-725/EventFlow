import Image from "next/image";
import { FaGithub, FaLinkedin, FaLink } from "react-icons/fa";

function TeamSection({images: developers}) {
    return (
        <div className="bg-[color:var(--primary-color)]">
            <div className="max-w-6xl mx-auto py-12 px-4 sm:px-6 lg:px-8 border-t border-slate-200">
                <div className="max-w-3xl mx-auto text-center pb-12 md:pb-16">
                    <h2 className="h2 mb-4 text-[color:var(--gray-color)]">
                        Our{" "}
                        <span className="text-[color:var(--secondary-color)]">
                            super cool
                        </span>{" "}
                        Team
                    </h2>
                </div>
                <div className="mt-10 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3 justify-items-center">
                    {developers?.map((developer) => (
                        <div
                            key={developer?.id}
                            className="flex flex-col bg-[color:var(--white-color)] border border-slate-200 rounded-3xl shadow-lg overflow-hidden hover:-translate-y-1 hover:shadow-2xl transition-all duration-200"
                        >
                            <div className="flex-shrink-0">
                                <Image
                                    className="w-full h-64 object-cover"
                                    src={developer?.src}
                                    alt={developer?.title}
                                    width={500}
                                    height={500}
                                    cover
                                />
                            </div>
                            <div className="flex-1 flex flex-col justify-between px-5 pb-5 pt-4">
                                <div>
                                    <h3 className="text-lg font-medium text-[color:var(--gray-color)]">
                                        {developer?.title}
                                    </h3>
                                    <p className="mt-2 text-base text-[color:var(--light-gray)]">
                                        {developer?.role}
                                    </p>
                                </div>
                                <div className="mt-6 flex-grow flex items-center">
                                    <div className="flex space-x-3">
                                        {developer?.githubUrl && (
                                            <a
                                                href={developer?.githubUrl}
                                                className="text-gray-500 hover:text-[color:var(--darker-secondary-color)] transition-all ease-in-out"
                                                target="_blank"
                                            >
                                                <span className="sr-only">
                                                    GitHub
                                                </span>
                                                <FaGithub className="h-6 w-6" />
                                            </a>
                                        )}
                                        {developer?.linkedinUrl && (
                                            <a
                                                href={developer?.linkedinUrl}
                                                className="text-gray-500 hover:text-[color:var(--darker-secondary-color)] transition-all ease-in-out"
                                                target="_blank"
                                            >
                                                <span className="sr-only">
                                                    LinkedIn
                                                </span>
                                                <FaLinkedin className="h-6 w-6" />
                                            </a>
                                        )}
                                        {developer?.websiteUrl && (
                                            <a
                                                href={developer?.websiteUrl}
                                                className="text-gray-500 hover:text-[color:var(--darker-secondary-color)] transition-all ease-in-out"
                                                target="_blank"
                                            >
                                                <span className="sr-only">
                                                    Personal Website
                                                </span>
                                                <FaLink className="h-6 w-6" />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TeamSection;
