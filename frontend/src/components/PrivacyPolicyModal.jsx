import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function PrivacyPolicyModal({ onClose }) {
    const dialogRef = useRef(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;

        dialog.showModal();
        document.body.style.overflow = 'hidden';

        return () => {
            dialog.close();
            document.body.style.overflow = previousOverflow;
            if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        };
    }, []);

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby="privacy-policy-title"
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
            className="fixed inset-0 m-auto w-[calc(100%_-_1.5rem)] max-w-2xl overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-xl backdrop:bg-black/50 sm:w-[calc(100%_-_2rem)] sm:rounded-3xl"
        >
            <div className="flex max-h-[90dvh] flex-col">
                <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[#E6CCA2] bg-[#FFFDF9] px-4 py-4 sm:px-6 sm:py-5">
                    <h2 id="privacy-policy-title" className="text-xl font-black text-[#6E473B] sm:text-2xl">
                        Privacy Policy
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close Privacy Policy"
                        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#6E473B] transition hover:bg-[#FCF8EE] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C05A11]"
                    >
                        <X aria-hidden="true" className="h-5 w-5" />
                    </button>
                </header>

                <div
                    tabIndex={0}
                    className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain break-words p-4 text-sm leading-relaxed text-stone-700 motion-safe:scroll-smooth [scrollbar-color:#E6CCA2_transparent] [scrollbar-width:thin] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#C05A11] sm:p-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-[#6E473B] [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5"
                >
                    <div>
                        <p className="text-base font-bold text-[#6E473B]">Smiley Page Corner</p>
                        <p className="mt-1 text-stone-500">Last updated: <time dateTime="2026-11-11">November 11, 2026</time></p>
                    </div>

                    <div className="space-y-3">
                        <p>
                            Smiley Page Corner (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) respects your privacy and is committed to protecting your personal data. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website at{' '}
                            <a href="https://smiley-page-corner.onrender.com/" className="font-medium text-[#A05A2C] underline">https://smileypagecorner.com</a>{' '}
                            (the &quot;Site&quot;) and purchase our custom cakes and products.
                        </p>
                        <p>Please read this Privacy Policy carefully. If you do not agree with the terms of this privacy policy, please do not access the Site.</p>
                    </div>

                    <section>
                        <h3>1. Information We Collect</h3>
                        <p className="mb-2">We may collect information about you in a variety of ways when you interact with our Site and place orders for our custom cakes. The information we may collect includes:</p>
                        <ul>
                            <li><strong>Personal Data:</strong> Personally identifiable information, such as your name, shipping address, email address, and telephone number, which you voluntarily give to us when you register with the Site, place an order, or contact us.</li>
                            <li><strong>Payment Data:</strong> Financial information related to your payment method (e.g., GCash transaction details) necessary to process your order. Please note that we do not store full payment credentials on our servers; these are handled directly by our secure payment processors.</li>
                            <li><strong>Derivative Data:</strong> Information our servers automatically collect when you access the Site, such as your IP address, your browser type, your operating system, your access times, and the pages you have viewed directly before and after accessing the Site.</li>
                            <li><strong>Customization Data:</strong> Specific details, messages, or design preferences you input into our 3D cake builder.</li>
                        </ul>
                    </section>

                    <section>
                        <h3>2. How We Use Your Information</h3>
                        <p className="mb-2">Having accurate information about you permits us to provide you with a smooth, efficient, and customized experience. Specifically, we may use information collected about you via the Site to:</p>
                        <ul>
                            <li>Process and fulfill your custom cake orders, including production and delivery.</li>
                            <li>Communicate with you regarding your order status, delivery updates, or cancellation requests.</li>
                            <li>Respond to customer service inquiries, refund requests, or complaints.</li>
                            <li>Send you administrative information, such as updates to our terms, conditions, and policies.</li>
                            <li>Improve our website, 3D builder performance, and overall customer experience.</li>
                            <li>Prevent fraudulent transactions, monitor against theft, and protect against criminal activity.</li>
                        </ul>
                    </section>

                    <section>
                        <h3>3. Disclosure of Your Information</h3>
                        <p className="mb-2">We do not sell, trade, or rent your personal information to third parties. We may share information we have collected about you in certain situations:</p>
                        <ul>
                            <li><strong>Third-Party Service Providers:</strong> We may share your information with third parties that perform services for us or on our behalf, including delivery and courier services, payment processing (e.g., GCash), data analysis, email delivery, and hosting services.</li>
                            <li><strong>By Law or to Protect Rights:</strong> If we believe the release of information about you is necessary to respond to legal process, to investigate or remedy potential violations of our policies, or to protect the rights, property, and safety of others, we may share your information as permitted or required by any applicable law, rule, or regulation.</li>
                        </ul>
                    </section>

                    <section>
                        <h3>4. Data Security</h3>
                        <p>We use administrative, technical, and physical security measures to help protect your personal information. While we have taken reasonable steps to secure the personal information you provide to us, please be aware that despite our efforts, no security measures are perfect or impenetrable, and no method of data transmission can be guaranteed against any interception or other type of misuse.</p>
                    </section>

                    <section>
                        <h3>5. Data Retention</h3>
                        <p>We will only retain your personal information for as long as necessary to fulfill the purposes we collected it for, including for the purposes of satisfying any legal, accounting, or reporting requirements.</p>
                    </section>

                    <section>
                        <h3>6. Your Data Privacy Rights</h3>
                        <p className="mb-2">Under the Data Privacy Act of 2012 (Republic Act No. 10173) of the Philippines, you have specific rights regarding your personal data:</p>
                        <ul>
                            <li><strong>Right to be Informed:</strong> You have the right to know whether your personal data is being processed.</li>
                            <li><strong>Right to Access:</strong> You can request access to the personal data we hold about you.</li>
                            <li><strong>Right to Rectification:</strong> You can request that we correct any inaccurate or incomplete personal data.</li>
                            <li><strong>Right to Erasure or Blocking:</strong> You can request the suspension, withdrawal, blocking, removal, or destruction of your personal data from our systems.</li>
                            <li><strong>Right to Object:</strong> You have the right to object to the processing of your personal data for direct marketing or profiling.</li>
                        </ul>
                        <p className="mt-2">To exercise any of these rights, please contact us using the information provided below.</p>
                    </section>

                    <section>
                        <h3>7. Use of Cookies</h3>
                        <p>We may use cookies, web beacons, tracking pixels, and other tracking technologies on the Site to help customize the Site and improve your experience. You can set your browser to remove or reject cookies, but be aware that such action could affect the availability and functionality of the 3D custom cake builder and cart operations.</p>
                    </section>

                    <section>
                        <h3>8. Changes to This Privacy Policy</h3>
                        <p>We reserve the right to make changes to this Privacy Policy at any time and for any reason. We will alert you about any changes by updating the &quot;Last updated&quot; date of this Privacy Policy. You are encouraged to periodically review this Privacy Policy to stay informed of updates.</p>
                    </section>

                    <section>
                        <h3>9. Contact Us</h3>
                        <p className="mb-2">If you have questions or comments about this Privacy Policy, please contact us at:</p>
                        <p>
                            Smiley Page Corner<br />
                            Silang, Cavite, Philippines<br />
                            Email: hello@smileypage.com<br />
                            Phone: +63 912 345 6789
                        </p>
                    </section>
                </div>
            </div>
        </dialog>
    );
}
