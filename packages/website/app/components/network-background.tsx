"use client";

import { useEffect, useRef, useState } from "react";

interface Castle {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  isFixed?: boolean;
}

export function NetworkBackground({ opacity = 0.3 }: { opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [castles, setCastles] = useState<Castle[]>([]);
  const animationFrameRef = useRef<number | undefined>(undefined);

  // Initialize castles with one fixed castle at (0,0) and 50 randomly positioned moving castles
  useEffect(() => {
    const padding = 0.25; // Extend canvas area by 25% on each side to allow castles to move off-screen
    const paddedWidth = window.innerWidth * (1 + 2 * padding);
    const paddedHeight = window.innerHeight * (1 + 2 * padding);
    const offsetX = -window.innerWidth * padding;
    const offsetY = -window.innerHeight * padding;

    const newCastles: Castle[] = [
      {
        id: 0,
        x: 0, // Position will track header logo in animation loop
        y: 0, // Position will track header logo in animation loop
        dx: 0,
        dy: 0,
        isFixed: true,
      },
      ...Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        x: offsetX + Math.random() * paddedWidth,
        y: offsetY + Math.random() * paddedHeight,
        dx: (Math.random() - 0.5) * 0.1, // Random velocity between -0.05 and 0.05
        dy: (Math.random() - 0.5) * 0.1,
      })),
    ];
    setCastles(newCastles);
  }, []);

  // Main animation loop and canvas setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const updateCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);

    // Load castle image
    const castleImage = new Image();
    castleImage.src = "/castle.png";

    const animate = () => {
      if (!ctx || !canvas) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update fixed castle position to match header logo
      const headerLogo = document.querySelector(".header-logo");
      if (headerLogo) {
        const rect = headerLogo.getBoundingClientRect();
        castles[0].x = rect.left;
        castles[0].y = rect.top;
      }

      // Update moving castle positions and handle boundary collisions
      const updatedCastles = castles.map((castle) => {
        if (castle.isFixed) return castle;

        const newX = castle.x + castle.dx;
        const newY = castle.y + castle.dy;
        let newDx = castle.dx;
        let newDy = castle.dy;

        if (newX < 0 || newX > canvas.width - 24) newDx = -castle.dx;
        if (newY < 0 || newY > canvas.height - 24) newDy = -castle.dy;

        return {
          ...castle,
          x: newX,
          y: newY,
          dx: newDx,
          dy: newDy,
        };
      });

      // Draw network connections between nearby castles
      updatedCastles.forEach((castle) => {
        // Connect each castle to its 8 nearest neighbors
        const peers = [...updatedCastles]
          .filter((peer) => peer.id !== castle.id)
          .sort((a, b) => {
            const distA = Math.hypot(a.x - castle.x, a.y - castle.y);
            const distB = Math.hypot(b.x - castle.x, b.y - castle.y);
            return distA - distB;
          })
          .slice(0, 8);

        // Draw connections with distance-based opacity
        peers.forEach((peer) => {
          const distance = Math.hypot(peer.x - castle.x, peer.y - castle.y);
          const maxDistance = Math.hypot(canvas.width, canvas.height) / 4;
          const opacity = Math.max(0.1, 1 - distance / maxDistance);

          ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
          ctx.beginPath();
          ctx.moveTo(castle.x + 12, castle.y + 12);
          ctx.lineTo(peer.x + 12, peer.y + 12);
          ctx.stroke();
        });
      });

      // Draw castles
      updatedCastles.forEach((castle) => {
        ctx.drawImage(castleImage, castle.x, castle.y, 24, 24);
      });

      setCastles(updatedCastles);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    castleImage.onload = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener("resize", updateCanvasSize);
    };
  }, [castles]);

  return (
    <canvas
      ref={canvasRef}
      className={`fixed top-0 left-0 w-full h-full pointer-events-none -z-10`}
      style={{ opacity }}
    />
  );
}
