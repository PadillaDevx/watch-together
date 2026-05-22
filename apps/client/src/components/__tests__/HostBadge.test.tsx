/// <reference types="vitest/globals" />
import { render, screen } from '@testing-library/react';
import { HostBadge } from '../HostBadge';

describe('HostBadge', () => {
    it('renders nothing when hostUsername is null', () => {
        const { container } = render(<HostBadge hostUsername={null} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing when hostUsername is empty', () => {
        const { container } = render(<HostBadge hostUsername="" />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders the host username when provided', () => {
        render(<HostBadge hostUsername="alice" />);
        const badge = screen.getByTestId('host-badge');
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveTextContent('alice');
    });

    it('truncates very long usernames and exposes full value via title', () => {
        const longName = 'a-very-long-host-username-overflowing';
        render(<HostBadge hostUsername={longName} />);
        const badge = screen.getByTestId('host-badge');
        expect(badge).toHaveAttribute('title', longName);
        // Truncated text contains ellipsis
        expect(badge.textContent).toMatch(/…$/);
        expect(badge.textContent!.length).toBeLessThan(longName.length);
    });

    it('applies the discrete styling contract', () => {
        render(<HostBadge hostUsername="bob" />);
        const badge = screen.getByTestId('host-badge');
        expect(badge.className).toContain('absolute');
        expect(badge.className).toContain('top-2');
        expect(badge.className).toContain('left-2');
        expect(badge.className).toContain('z-20');
        expect(badge.className).toContain('pointer-events-none');
        expect(badge.className).toContain('bg-violet-700/70');
        expect(badge.className).toContain('rounded-full');
    });
});
