/**
 * Unit Price Component JavaScript
 * Handles interactive functionality for unit price display
 */

class UnitPriceComponent {
    constructor() {
        this.initializeEventListeners();
        this.formatNumbers();
    }

    /**
     * Initialize event listeners for interactive elements
     */
    initializeEventListeners() {
        // Expandable section toggle
        const toggleButton = document.querySelector('.unit-price-toggle');
        if (toggleButton) {
            toggleButton.addEventListener('click', this.toggleDetails.bind(this));
        }

        // Copy to clipboard functionality
        const copyButtons = document.querySelectorAll('[data-copy]');
        copyButtons.forEach(button => {
            button.addEventListener('click', this.copyToClipboard.bind(this));
        });

        // Comparison mode (future feature)
        const compareButtons = document.querySelectorAll('.unit-price-compare-icon');
        compareButtons.forEach(button => {
            button.addEventListener('click', this.addToComparison.bind(this));
        });
    }

    /**
     * Toggle expandable details section
     */
    toggleDetails(event) {
        event.preventDefault();
        
        const button = event.currentTarget;
        const details = document.querySelector('.unit-price-details');
        const icon = button.querySelector('.unit-price-toggle-icon');
        
        if (!details) return;

        const isExpanded = button.getAttribute('aria-expanded') === 'true';
        
        // Toggle states
        button.setAttribute('aria-expanded', !isExpanded);
        details.classList.toggle('expanded');
        
        // Animate the expansion
        if (!isExpanded) {
            details.style.display = 'block';
            // Force reflow for animation
            details.offsetHeight;
            details.classList.add('expanded');
        } else {
            details.classList.remove('expanded');
            setTimeout(() => {
                if (!details.classList.contains('expanded')) {
                    details.style.display = 'none';
                }
            }, 200);
        }

        // Update button text
        const buttonText = button.querySelector('span');
        if (buttonText) {
            buttonText.textContent = isExpanded ? '자세히 보기' : '간단히 보기';
        }
    }

    /**
     * Copy unit price information to clipboard
     */
    async copyToClipboard(event) {
        const button = event.currentTarget;
        const textToCopy = button.getAttribute('data-copy');
        
        if (!textToCopy) return;

        try {
            await navigator.clipboard.writeText(textToCopy);
            this.showCopyFeedback(button);
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            // Fallback for older browsers
            this.fallbackCopyToClipboard(textToCopy);
        }
    }

    /**
     * Fallback copy method for older browsers
     */
    fallbackCopyToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
            console.log('Fallback copy successful');
        } catch (err) {
            console.error('Fallback copy failed:', err);
        }
        
        document.body.removeChild(textArea);
    }

    /**
     * Show visual feedback for copy action
     */
    showCopyFeedback(button) {
        const originalContent = button.innerHTML;
        const checkIcon = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        `;
        
        button.innerHTML = checkIcon;
        button.style.color = 'var(--success-color)';
        
        setTimeout(() => {
            button.innerHTML = originalContent;
            button.style.color = '';
        }, 2000);
    }

    /**
     * Add product to comparison (placeholder for future feature)
     */
    addToComparison(event) {
        event.preventDefault();
        
        const productId = document.querySelector('[data-product-id]')?.getAttribute('data-product-id');
        if (!productId) return;

        // Store in localStorage for now
        const comparison = JSON.parse(localStorage.getItem('unitPriceComparison') || '[]');
        
        if (!comparison.includes(productId)) {
            comparison.push(productId);
            localStorage.setItem('unitPriceComparison', JSON.stringify(comparison));
            this.showComparisonFeedback(event.currentTarget);
        }
    }

    /**
     * Show feedback for comparison addition
     */
    showComparisonFeedback(element) {
        const feedback = document.createElement('div');
        feedback.className = 'unit-price-feedback';
        feedback.textContent = '비교 목록에 추가됨';
        feedback.style.cssText = `
            position: absolute;
            top: -30px;
            right: 0;
            background: var(--success-color);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
            opacity: 0;
            animation: fadeInOut 2s ease-in-out forwards;
        `;

        element.style.position = 'relative';
        element.appendChild(feedback);

        setTimeout(() => {
            if (feedback.parentNode) {
                feedback.parentNode.removeChild(feedback);
            }
        }, 2000);
    }

    /**
     * Format numbers for better readability
     */
    formatNumbers() {
        const priceElements = document.querySelectorAll('.unit-price-value, .unit-price-compact-value');
        
        priceElements.forEach(element => {
            const text = element.textContent;
            const numberMatch = text.match(/[\d,]+\.?\d*/);
            
            if (numberMatch) {
                const number = parseFloat(numberMatch[0].replace(/,/g, ''));
                if (!isNaN(number)) {
                    const formattedNumber = this.formatPrice(number);
                    element.innerHTML = element.innerHTML.replace(numberMatch[0], formattedNumber);
                }
            }
        });
    }

    /**
     * Format price with appropriate precision
     */
    formatPrice(price) {
        if (price >= 1000) {
            return price.toLocaleString('ko-KR');
        } else if (price >= 1) {
            return price.toLocaleString('ko-KR', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 1
            });
        } else {
            return price.toLocaleString('ko-KR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4
            });
        }
    }

    /**
     * Calculate value score for badge display
     */
    calculateValueScore(unitPriceInfo) {
        // This would compare against similar products
        // Placeholder logic for demonstration
        const { price_per_mg, price_per_item } = unitPriceInfo;
        
        // In a real implementation, this would compare against category averages
        const avgPricePerMg = 0.5; // Example average
        const avgPricePerItem = 500; // Example average
        
        if (price_per_mg && price_per_mg < avgPricePerMg * 0.8) {
            return 'excellent';
        } else if (price_per_mg && price_per_mg < avgPricePerMg * 0.9) {
            return 'good';
        }
        
        return 'fair';
    }

    /**
     * Generate unit price HTML
     */
    static generateHTML(unitPriceInfo, options = {}) {
        const {
            showExpandable = true,
            showBadge = true,
            compact = false
        } = options;

        if (!unitPriceInfo) return '';

        const {
            unit_description,
            item_description,
            unit_volume,
            unit_type,
            quantity,
            total_volume,
            price_per_mg,
            price_per_item
        } = unitPriceInfo;

        if (compact) {
            return `
                <div class="unit-price-compact">
                    <div class="unit-price-compact-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M12 1v6m0 6v6"></path>
                            <path d="m21 12-6-3-6 3-6-3"></path>
                        </svg>
                    </div>
                    <div class="unit-price-compact-info">
                        <div class="unit-price-compact-label">단위 가격</div>
                        <div class="unit-price-compact-value">${unit_description || '계산 중'}</div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="unit-price-section">
                ${showBadge ? '<div class="unit-price-badge">가성비</div>' : ''}
                
                <div class="unit-price-header">
                    <svg class="unit-price-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M12 1v6m0 6v6"></path>
                        <path d="m21 12-6-3-6 3-6-3"></path>
                    </svg>
                    <h3 class="unit-price-title">단위 가격 정보</h3>
                </div>

                <div class="unit-price-grid">
                    <div class="unit-price-item unit-price-tooltip">
                        <div class="unit-price-label">용량당 가격</div>
                        <div class="unit-price-value">
                            ${unit_description || '계산 중'}
                            <svg class="unit-price-compare-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 11H1l8-8 8 8"></path>
                                <path d="M9 21v-10"></path>
                            </svg>
                        </div>
                        <div class="unit-price-tooltip-content">클릭하여 비교 목록에 추가</div>
                    </div>
                    
                    <div class="unit-price-item unit-price-tooltip">
                        <div class="unit-price-label">개당 가격</div>
                        <div class="unit-price-value">
                            ${item_description || '계산 중'}
                            <svg class="unit-price-compare-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 11H1l8-8 8 8"></path>
                                <path d="M9 21v-10"></path>
                            </svg>
                        </div>
                        <div class="unit-price-tooltip-content">클릭하여 비교 목록에 추가</div>
                    </div>
                </div>

                ${showExpandable ? `
                <div class="unit-price-expandable">
                    <button class="unit-price-toggle" aria-expanded="false" type="button">
                        <span>자세히 보기</span>
                        <svg class="unit-price-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                    
                    <div class="unit-price-details">
                        <div class="unit-price-breakdown">
                            <div class="unit-price-breakdown-item">
                                <span class="unit-price-breakdown-label">용량</span>
                                <span class="unit-price-breakdown-value">${unit_volume} ${unit_type}</span>
                            </div>
                            <div class="unit-price-breakdown-item">
                                <span class="unit-price-breakdown-label">수량</span>
                                <span class="unit-price-breakdown-value">${quantity}개</span>
                            </div>
                            <div class="unit-price-breakdown-item">
                                <span class="unit-price-breakdown-label">총 용량</span>
                                <span class="unit-price-breakdown-value">${total_volume} ${unit_type}</span>
                            </div>
                            <div class="unit-price-breakdown-item">
                                <span class="unit-price-breakdown-label">mg당 가격</span>
                                <span class="unit-price-breakdown-value">${price_per_mg ? price_per_mg.toFixed(4) + '원' : 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }
}

// Add CSS for feedback animation
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInOut {
        0%, 100% { opacity: 0; transform: translateY(-5px); }
        20%, 80% { opacity: 1; transform: translateY(0); }
    }
`;
document.head.appendChild(style);

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new UnitPriceComponent();
    });
} else {
    new UnitPriceComponent();
}

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UnitPriceComponent;
}