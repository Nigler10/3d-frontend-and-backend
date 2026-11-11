import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function TermsAndConditionsModal({ onClose }) {
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
            aria-labelledby="terms-and-conditions-title"
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
                    <h2 id="terms-and-conditions-title" className="text-xl font-black text-[#6E473B] sm:text-2xl">
                        Terms and Conditions
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close Terms and Conditions"
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
                        <p className="mt-1 text-stone-500">Last updated: <time dateTime="2026-11-05">November 5, 2026</time></p>
                    </div>

                    <p>Please read these Terms and Conditions (“Terms of Service”) carefully before using the Smiley Page Corner website (the “Site”) or purchasing any products through it. By accessing the Site or placing an order, you agree to be bound by these Terms. If you do not agree, please do not use the Site.</p>

                    <section>
                        <h3>1. About Us</h3>
                        <p>Smiley Page Corner operates this website at https://smileypagecorner.com. Our business address is Silang, Cavite, Philippines, and you can contact us at +63 912 345 6789 / hello@smileypage.com.</p>
                    </section>

                    <section>
                        <h3>2. Eligibility</h3>
                        <p>By using this Site, you confirm that you are at least 18 years old, or are using the Site under the supervision of a parent or legal guardian, and that you have the legal capacity to enter into a binding contract.</p>
                    </section>

                    <section>
                        <h3>3. Products and Pricing</h3>
                        <ul>
                            <li>All products listed on the Site are subject to availability.</li>
                            <li>We reserve the right to limit quantities, discontinue products, or refuse any order at our discretion.</li>
                            <li>Prices are listed in PHP (₱) and are subject to change without notice. The price charged will be the price displayed at the time your order is placed.</li>
                            <li>We make reasonable efforts to display product colors and details accurately, but we do not guarantee that your device’s display will be accurate.</li>
                        </ul>
                    </section>

                    <section>
                        <h3>4. Orders and Payment</h3>
                        <ul>
                            <li>By placing an order, you are making an offer to purchase the product(s) in your cart, which we may accept or decline.</li>
                            <li>We accept the following payment methods: GCash.</li>
                            <li>You confirm that any payment information you provide is accurate and that you are authorized to use the payment method.</li>
                            <li>Orders are not confirmed until you receive an order confirmation email from us.</li>
                        </ul>
                    </section>

                    <section>
                        <h3>5. Shipping and Delivery</h3>
                        <ul>
                            <li>Estimated shipping times depend on your chosen delivery time and may vary based on your location and product availability.</li>
                            <li>Shipping costs are calculated at checkout and are the customer’s responsibility unless otherwise stated.</li>
                            <li>We are not responsible for delays caused by couriers or events outside our control.</li>
                        </ul>
                    </section>

                    <section>
                        <h3>6. Returns, Refunds, and Exchanges</h3>
                        <ul>
                            <li>All sales are final. We do not accept returns or exchanges, and we do not issue refunds on any order once payment has been made — whether a partial deposit or payment in full.</li>
                            <li>Please review your order carefully (items, sizes, colors, quantities) before completing payment, as it cannot be undone once submitted.</li>
                            <li>The sole exception is a damaged or incorrect cake received: contact us at hello@smileypage.com within an hour of delivery, and we will review the issue at our discretion.</li>
                        </ul>
                    </section>

                    <section>
                        <h3>7. Cancellations</h3>
                        <p>Once an order has been placed and any payment has been made — whether a partial deposit or payment in full — it cannot be cancelled or modified. Please ensure all order details are correct before submitting payment.</p>
                    </section>

                    <section>
                        <h3>8. Account Registration</h3>
                        <p>If you create an account on the Site, you are responsible for maintaining the confidentiality of your login details and for all activity under your account. Notify us immediately of any unauthorized use.</p>
                    </section>

                    <section>
                        <h3>9. Intellectual Property</h3>
                        <p>All content on the Site, including text, graphics, logos, images, and the Smiley Page Corner name and branding, is owned by or licensed to us and protected by copyright and trademark laws. You may not copy, reproduce, or use our content without prior written permission.</p>
                    </section>

                    <section>
                        <h3>10. User Conduct</h3>
                        <p className="mb-2">When using the Site, you agree not to:</p>
                        <ul>
                            <li>Violate any applicable law or regulation</li>
                            <li>Submit false or misleading information</li>
                            <li>Attempt to gain unauthorized access to the Site or its systems</li>
                            <li>Use the Site for any fraudulent or harmful purpose</li>
                            <li>Interfere with the Site’s security or functionality</li>
                        </ul>
                    </section>

                    <section>
                        <h3>11. Reviews and User Content</h3>
                        <p>If you submit reviews, comments, or other content to the Site, you grant us a non-exclusive, royalty-free, worldwide license to use, reproduce, and display that content. You agree your content will not be unlawful, offensive, or infringe on others’ rights.</p>
                    </section>

                    <section>
                        <h3>12. Indemnification</h3>
                        <p>You agree to indemnify and hold harmless Smiley Page Corner, its owners, and employees from any claims, damages, or expenses arising from your use of the Site or violation of these Terms.</p>
                    </section>

                    <section>
                        <h3>13. Privacy</h3>
                        <p>Your use of the Site is also governed by our Privacy Policy, which explains how we collect, use, and protect your personal information.</p>
                    </section>

                    <section>
                        <h3>14. Changes to These Terms</h3>
                        <p>We may update these Terms from time to time. Changes will be posted on this page with an updated “Last updated” date. Continued use of the Site after changes constitutes acceptance of the revised Terms.</p>
                    </section>

                    <section>
                        <h3>15. Governing Law</h3>
                        <p>These Terms are governed by the laws of Philippines, without regard to conflict of law principles. Any disputes shall be resolved in the courts of Cavite jurisdiction pursuant to Republic Act No. 11967 (Internet Transactions Act of 2023).</p>
                    </section>

                    <section>
                        <h3>16. Contact Us</h3>
                        <p className="mb-2">If you have any questions about these Terms, please contact us at:</p>
                        <p>
                            Smiley Page Corner<br />
                            Silang, Cavite, Philippines<br />
                            hello@smileypage.com<br />
                            +63 912 345 6789
                        </p>
                    </section>
                </div>
            </div>
        </dialog>
    );
}
