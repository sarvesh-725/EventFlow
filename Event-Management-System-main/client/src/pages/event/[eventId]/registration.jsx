import AdminNavBar from "@/components/AdminNavBar";
import dummyUsers from "@/utils/dummyUsers";
import { useState, useEffect } from "react";
import { FaCheck } from "react-icons/fa";
import { useRouter } from "next/router";
import { useTheme } from "@/context/ThemeContext";

const Registration = () => {
    const router = useRouter();
    const { theme } = useTheme();
    const eventId = router.query.eventId;
    const [showChecklist, setShowChecklist] = useState(false);
    const [users, setUsers] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        const fetchEvent = async () => {
            try {
                const response = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL}/getevent`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            event_id: eventId,
                        }),
                    }
                );
                if (response.ok) {
                    const data = await response.json();
                    setUsers(data.participants);
                } else {
                    throw new Error(
                        `${response.status} ${response.statusText}`
                    );
                }
            } catch (error) {
                console.error("Error fetching event data:", error.message);
            }
        };

        if (eventId) {
            fetchEvent();
        }
    }, [eventId]);

    function handleCheckboxChange(userId) {
        setUsers(
            users.map((user) => {
                if (user.id === userId) {
                    return {
                        ...user,
                        checked: !user.checked,
                    };
                }
                return user;
            })
        );
    }

    const handleSubmit = async () => {
        const checkedUsers = users
            .filter((user) => user.checked)
            .map((user) => user.id);
        console.log(checkedUsers);

        try {
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/event/checkin`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        event_id: eventId,
                        checkInList: checkedUsers,
                    }),
                }
            );
            if (response.ok) {
                const data = await response.json();
                if (data.msg == "success") {
                    router.reload();
                }
            } else {
                throw new Error(`${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.error("Error fetching event data:", error.message);
        }
    };

    // Theme-aware classes
    const tableHeaderBg = theme === "dark" ? "bg-slate-800" : "bg-gray-100";
    const tableBorder = theme === "dark" ? "border-slate-700" : "border-gray-300";
    const tableText = theme === "dark" ? "text-gray-200" : "text-gray-900";
    const inactiveButtonBg = theme === "dark" ? "bg-slate-700 text-gray-200" : "bg-gray-300 text-gray-800";
    const inputBg = theme === "dark" ? "bg-slate-800 text-gray-200 placeholder-gray-400" : "bg-white text-gray-900 placeholder-gray-500";
    const inputBorder = theme === "dark" ? "border-slate-600" : "border-gray-400";

    return (
        <div className="pt-20 lg:pt-8 bg-[color:var(--primary-color)] text-[color:var(--gray-color)]">
            <AdminNavBar />
            <div className="container h-screen mx-auto my-4">
                <div className="flex flex-col gap-y-3 sm:flex-row sm:gap-y-0 justify-between items-center mb-4">
                    <div className="flex space-x-2">
                        <button
                            className={`px-4 py-2 rounded transition-colors ${
                                showChecklist
                                    ? inactiveButtonBg
                                    : "bg-[color:var(--darker-secondary-color)] text-white hover:bg-[color:var(--secondary-color)]"
                            }`}
                            onClick={() => setShowChecklist(false)}
                        >
                            All Users
                        </button>
                        <button
                            className={`px-4 py-2 rounded transition-colors ${
                                showChecklist
                                    ? "bg-[color:var(--darker-secondary-color)] text-white hover:bg-[color:var(--secondary-color)]"
                                    : inactiveButtonBg
                            }`}
                            onClick={() => setShowChecklist(true)}
                        >
                            Check List
                        </button>
                    </div>
                    <div>
                        <input
                            type="text"
                            placeholder="Search by name"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={`px-[3%] py-1 border ${inputBorder} ${inputBg} rounded-md focus:border-[color:var(--darker-secondary-color)] focus:outline-none focus:ring-1 focus:ring-[color:var(--darker-secondary-color)]`}
                        />
                    </div>
                </div>

                {showChecklist ? (
                    <div className="overflow-x-auto overflow-y-auto">
                        <table className={`w-full border ${tableBorder}`}>
                            <thead>
                                <tr>
                                    <th className={`p-2 ${tableHeaderBg} ${tableBorder} border ${tableText}`}>
                                        #
                                    </th>
                                    <th className={`p-2 ${tableHeaderBg} ${tableBorder} border ${tableText}`}>
                                        Name
                                    </th>
                                    <th className={`p-2 ${tableHeaderBg} ${tableBorder} border ${tableText}`}>
                                        Email
                                    </th>
                                    <th className={`p-2 ${tableHeaderBg} ${tableBorder} border ${tableText}`}>
                                        Reg. No.
                                    </th>
                                    <th className={`p-2 ${tableHeaderBg} ${tableBorder} border ${tableText}`}>
                                        Checked
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* .filter((user) => user.checked) */}
                                {users
                                    .filter(
                                        (user) =>
                                            user.name
                                                .toLowerCase()
                                                .includes(
                                                    searchQuery.toLowerCase()
                                                ) && !user.entry
                                    )
                                    .map((user, index) => (
                                        <tr
                                            key={user.id}
                                            className={`${tableText} ${
                                                user.checked ? "line-through opacity-60" : ""
                                            }`}
                                        >
                                            <td className={`p-2 border ${tableBorder}`}>
                                                {index + 1}
                                            </td>
                                            <td className={`p-2 border ${tableBorder}`}>
                                                {user.name}
                                            </td>
                                            <td className={`p-2 border ${tableBorder}`}>
                                                {user.email}
                                            </td>
                                            <td className={`p-2 border ${tableBorder}`}>
                                                {user.regno}
                                            </td>
                                            <td className={`p-2 border ${tableBorder} text-center w-1/4`}>
                                                <label
                                                    htmlFor={`checkbox-${user.id}`}
                                                    className="flex cursor-pointer"
                                                >
                                                    <div className="relative">
                                                        <input
                                                            id={`checkbox-${user.id}`}
                                                            type="checkbox"
                                                            value={user.id}
                                                            onChange={() =>
                                                                handleCheckboxChange(
                                                                    user.id
                                                                )
                                                            }
                                                            className="sr-only"
                                                        />
                                                        <div
                                                            className={`${theme === "dark" ? "bg-slate-800" : "bg-white"} border border-[color:var(--darker-secondary-color)] rounded-md shadow-sm w-6 h-6 flex items-center justify-center mr-2 ${
                                                                user.checked
                                                                    ? "ring-1 ring-[color:var(--darker-secondary-color)]"
                                                                    : ""
                                                            }`}
                                                        >
                                                            {user.checked && (
                                                                <FaCheck className="text-[color:var(--secondary-color)]" />
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="select-none">
                                                        {user.passID}
                                                    </div>
                                                </label>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="overflow-x-auto overflow-y-auto">
                        <table className={`w-full border ${tableBorder}`}>
                            <thead>
                                <tr>
                                    <th className={`p-2 ${tableHeaderBg} ${tableBorder} border ${tableText}`}>
                                        #
                                    </th>
                                    <th className={`p-2 ${tableHeaderBg} ${tableBorder} border ${tableText}`}>
                                        Name
                                    </th>
                                    <th className={`p-2 ${tableHeaderBg} ${tableBorder} border ${tableText}`}>
                                        Email
                                    </th>
                                    <th className={`p-2 ${tableHeaderBg} ${tableBorder} border ${tableText}`}>
                                        Reg. No.
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {users
                                    .filter((user) =>
                                        user.name
                                            .toLowerCase()
                                            .includes(searchQuery.toLowerCase())
                                    )
                                    .map((user, index) => (
                                        <tr key={user.id} className={tableText}>
                                            <td className={`p-2 border ${tableBorder}`}>
                                                {index + 1}
                                            </td>
                                            <td className={`p-2 border ${tableBorder}`}>
                                                {user.name}
                                            </td>
                                            <td className={`p-2 border ${tableBorder}`}>
                                                {user.email}
                                            </td>
                                            <td className={`p-2 border ${tableBorder}`}>
                                                {user.regno}
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {showChecklist ? (
                    <center>
                        <button
                            onClick={handleSubmit}
                            className="bg-[color:var(--darker-secondary-color)] hover:bg-[color:var(--secondary-color)] mt-3 text-white py-3 px-[15%] rounded-md transition duration-300 ease-in-out"
                        >
                            Submit list
                        </button>
                    </center>
                ) : null}
            </div>
        </div>
    );
};

export default Registration;
