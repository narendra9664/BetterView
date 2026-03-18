import { Box, LayoutGrid, Home } from "lucide-react";
import Button from "./ui/Button";
import { useOutletContext, useNavigate, NavLink } from "react-router";
import type { AuthOutletContext } from "../type.d";

const Navbar = () => {
    const { isSignedIn, userName, signIn, signOut } = useOutletContext<AuthOutletContext>();
    const navigate = useNavigate();

    const handleAuthClick = async () => {
        if (isSignedIn) {
            try { await signOut(); } catch (e) { console.error("Sign out failed:", e); }
        } else {
            try { await signIn(); } catch (e) { console.error("Sign in failed:", e); }
        }
    };

    return (
        <header className="navbar-dark">
            <nav className="navbar-dark__inner">
                <div className="navbar-dark__left">
                    <div className="navbar-dark__brand" onClick={() => navigate("/")} role="button">
                        <div className="navbar-dark__logo">
                            <Box size={18} />
                        </div>
                        <span className="navbar-dark__name">BetterView</span>
                    </div>

                    <ul className="navbar-dark__links">
                        <a href="#upload" className="navbar-dark__link">Upload</a>
                        {isSignedIn && (
                            <NavLink to="/dashboard" className="navbar-dark__link flex items-center gap-1">
                                <LayoutGrid size={13} /> Dashboard
                            </NavLink>
                        )}
                        <NavLink to="/pricing" className="navbar-dark__link">Pricing</NavLink>
                    </ul>
                </div>

                <div className="navbar-dark__actions">
                    {isSignedIn ? (
                        <>
                            <span className="navbar-dark__greeting">
                                {userName ? `Hi, ${userName}` : "Signed in"}
                            </span>
                            <button className="navbar-dark__btn-ghost" onClick={handleAuthClick}>
                                Log Out
                            </button>
                        </>
                    ) : (
                        <>
                            <button className="navbar-dark__btn-ghost" onClick={handleAuthClick}>
                                Log In
                            </button>
                            <a href="#upload" className="navbar-dark__btn-primary">Get Started</a>
                        </>
                    )}
                </div>
            </nav>
        </header>
    );
};

export default Navbar;
