import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
    const isLoggedIn = !!req.auth
    const isLoginPage = req.nextUrl.pathname === "/login"

    if (!isLoggedIn && !isLoginPage) {
        return NextResponse.redirect(new URL("/login", req.nextUrl))
    }

    if (isLoggedIn && isLoginPage) {
        return NextResponse.redirect(new URL("/", req.nextUrl))
    }

    return NextResponse.next()
})

export const config = {
    matcher: ["/((?!api/auth|api/proxy|_next/static|_next/image|favicon.ico).*)"],
}
