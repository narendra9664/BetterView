import { Box, LayoutGrid } from "lucide-react";
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
        <header className="navbar">
            <nav className="inner">
                <div className="left">
                    <div className="brand" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
                        <Box className="logo" />
                        <span className="name">BetterView</span>
                    </div>

                    <ul className="links">
                        <a href="#upload">Upload</a>
                        {isSignedIn && (
                            <NavLink to="/dashboard" className="flex items-center gap-1">
                                <LayoutGrid size={14} /> Dashboard
                            </NavLink>
                        )}
                        <NavLink to="/pricing">Pricing</NavLink>
                    </ul>
                </div>

                <div className="actions">
                    {isSignedIn ? (
                        <>
                            <span className="greeting">
                                {userName ? `Hi, ${userName}` : "Signed in"}
                            </span>
                            <Button size="sm" onClick={handleAuthClick} className="btn">
                                Log Out
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button onClick={handleAuthClick} size="sm" variant="ghost">
                                Log In
                            </Button>
                            <a href="#upload" className="cta">Get Started</a>
                        </>
                    )}
                </div>
            </nav>
        </header>
    );
};

export default Navbar;
