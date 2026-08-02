import { useEffect } from 'react'
import { LINKS } from '../site.js'

export default function Privacy() {
  useEffect(() => {
    document.title = 'Privacy Policy & Terms of Service — Sang'
  }, [])

  return (
    <section className="legal">
      <div className="container container--narrow">
        <article className="legal__doc">
          <h1>Terms of Service &amp; Privacy Policy</h1>
          <p className="legal__updated">Last updated: July 21, 2026</p>

          <h2>Terms of Service</h2>

          <h3>Welcome to Sang</h3>
          <p>
            Sang is a professional networking platform that helps people connect, exchange digital
            business cards, build meaningful professional relationships, and manage their
            professional network. By accessing or using Sang, you agree to these Terms of Service and
            Privacy Policy.
          </p>

          <h3>1. Use of the App</h3>
          <p>
            You agree to use Sang responsibly and in accordance with applicable laws. You must not
            misuse the app, attempt unauthorized access, or interfere with its normal operation.
          </p>

          <h3>2. Accounts</h3>
          <p>
            You are responsible for maintaining the security of your account and the accuracy of the
            information you provide.
          </p>

          <h3>3. Connections &amp; Information Sharing</h3>
          <p>
            When you scan another user’s Sang Card or accept a connection request, a connection is
            established between both users. The profile information that each user has chosen to share
            through their Sang Card will be exchanged and become available to both connected users.
          </p>
          <p>Users are responsible for choosing the information they share through their Sang Card.</p>

          <h3>4. Intellectual Property</h3>
          <p>
            All trademarks, logos, software, designs, and content available in Sang are the property
            of Sang or its licensors and may not be copied or used without permission.
          </p>

          <h3>5. Changes to These Terms</h3>
          <p>
            We may update these Terms from time to time. Continued use of Sang after any updates means
            you accept the revised Terms.
          </p>

          <div className="legal__divider" />

          <h2>Privacy Policy</h2>
          <p>Sang respects your privacy and is committed to protecting your personal information.</p>

          <h3>Information We Collect</h3>
          <p>When using Sang, you may provide the following information or grant the following permissions:</p>
          <ul>
            <li>Name, email address, profile photo, and professional details.</li>
            <li>Camera access to scan QR codes and update your profile photo.</li>
            <li>Contacts to help manage professional connections.</li>
            <li>Location information to support networking features and remember where connections were made.</li>
            <li>Device and diagnostic information through Firebase Analytics and Firebase Crashlytics to improve app performance and stability.</li>
          </ul>

          <h3>How We Use Your Information</h3>
          <p>Your information is used to:</p>
          <ul>
            <li>Create and manage your account.</li>
            <li>Enable digital business card sharing.</li>
            <li>Establish and manage professional connections.</li>
            <li>Support networking features.</li>
            <li>Improve app performance, security, and user experience.</li>
          </ul>

          <h3>Data Sharing</h3>
          <p>
            Sang uses trusted third-party services, including Google Firebase, for authentication,
            secure cloud storage, analytics, and crash reporting. Information is processed only as
            necessary to provide and improve the app.
          </p>
          <p>
            Information that you choose to share through your Sang Card is made available to users
            with whom you establish a connection.
          </p>

          <h3>Permissions</h3>
          <p>Sang may request access to:</p>
          <ul>
            <li><strong>Camera</strong> — to scan QR codes and update your profile photo.</li>
            <li><strong>Contacts</strong> — to help manage your professional connections.</li>
            <li><strong>Location</strong> — to support networking features and remember where connections were made.</li>
          </ul>
          <p>Permissions can be changed at any time through your device settings.</p>

          <h3>Data Security</h3>
          <p>
            We use reasonable technical and organizational measures to protect your information.
            However, no method of electronic storage or internet transmission is completely secure.
          </p>

          <h3>Your Choices</h3>
          <p>You may:</p>
          <ul>
            <li>Update your profile and card information.</li>
            <li>Revoke Camera, Contacts, or Location permissions from your device settings.</li>
            <li>Delete your account at any time through the app.</li>
          </ul>

          <h3>Account Deletion</h3>
          <p>You may delete your account at any time through the app.</p>
          <p>
            Deleting your account does not automatically remove digital business card information that
            you previously shared with your existing connections. Information already shared may
            continue to be accessible to those connections as part of your past interactions and
            shared connection history.
          </p>

          <h3>Changes to This Policy</h3>
          <p>
            We may update this Privacy Policy periodically. Continued use of the app after updates
            indicates your acceptance of the revised policy.
          </p>

          <h3>Contact Us</h3>
          <p>If you have any questions about these Terms or Privacy Policy, please contact us at:</p>
          <p className="legal__contact">
            <strong>Email:</strong> <a href={`mailto:${LINKS.email}`}>{LINKS.email}</a>
          </p>
        </article>
      </div>
    </section>
  )
}
