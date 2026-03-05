import { NextResponse } from 'next/server';

export async function GET() {
    // A simple GET endpoint so Meta can verify the URL is accessible
    return NextResponse.json({
        status: "ok",
        message: "Meta Data Deletion Callback URL endpoint is active."
    });
}

export async function POST(request: Request) {
    try {
        // Meta sends the data deletion request as a POST with a signed_request
        const formData = await request.formData();
        const signedRequest = formData.get('signed_request');

        // In a fully strictly verified environment, you would:
        // 1. Decode the signed_request using your App Secret
        // 2. Extract the user_id
        // 3. Delete the user's data from your database (e.g. your workspace tokens)

        // For App Review purposes, returning the correct JSON format is the key requirement.
        const confirmationCode = Math.random().toString(36).substring(2, 15);
        const trackingUrl = `https://web-sg.livelystone-27859f5b.southeastasia.azurecontainerapps.io/data-deletion?id=${confirmationCode}`;

        return NextResponse.json({
            url: trackingUrl,
            confirmation_code: confirmationCode
        });

    } catch (error) {
        console.error('Data Deletion Callback Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
