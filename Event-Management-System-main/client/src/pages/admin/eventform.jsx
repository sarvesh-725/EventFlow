import AdminNavBar from "@/components/AdminNavBar";
import CreateEventForm from "@/components/CreateEventForm";
import Image from "next/image";
import React from "react";

function eventform() {
    return (
        <div className="pt-20 lg:pt-8 bg-[color:var(--primary-color)]">
            <AdminNavBar />
            <div className="flex justify-center px-4 py-10 md:py-12">
                <div className="flex w-full max-w-6xl flex-col md:flex-row md:h-[calc(88vh)] justify-center items-stretch md:items-center bg-[color:var(--primary-color)]">
                    <div className="flex-1 mx-6 mb-6 bg-[color:var(--primary-color)]">
                        <Image
                            src="/img/eventsFormImg.jpg"
                            alt="Event Image"
                            width={500}
                            height={500}
                            className="w-full h-full object-contain md:object-cover rounded-lg shadow-lg"
                        />
                    </div>
                    <div className="flex-1 m-6 md:m-0 md:mr-6 md:mb-6">
                        <CreateEventForm />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default eventform;
