package com.unsa.backend.jwt;

import java.security.Key;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;

@Service
public class JwtService {

    // En Kubernetes/AWS la clave llega por la variable JWT_SECRET (Secret "jwt-secret", generado al desplegar).
    // La clave fija solo se usa en desarrollo local.
    private static final String JWT_SECRET = java.util.Optional.ofNullable(System.getenv("JWT_SECRET"))
            .filter(s -> s.length() >= 32)
            .orElse("unsa-social-network-super-secure-jwt-secret-key-2026-production!");
    private static final Key SECRET_KEY = Keys.hmacShaKeyFor(JWT_SECRET.getBytes(java.nio.charset.StandardCharsets.UTF_8));

    public String getToken(UserDetails userDetails){
        return getToken(new HashMap<>(),userDetails);
    }

    private String getToken(Map<String, Object> extraClaims, UserDetails user) {
        return Jwts.builder()
                    .setClaims(extraClaims)
                    .setSubject(user.getUsername())
                    .setIssuedAt(new Date(System.currentTimeMillis()))
                    .setExpiration(new Date(System.currentTimeMillis() + 3600000)) // 1 hora de expiración
                    .signWith(SECRET_KEY) // Asegúrate de tener una clave segura
                    .compact();
    }

    public String getUsernameFromToken(String token) {
        return getClaim(token, Claims::getSubject);
    }

    public boolean isTokenValid(String token, UserDetails userDetails) {
        final String username = getUsernameFromToken(token);
        return (username.equals(userDetails.getUsername()) && !isTokenExpired(token));
    }

    private Claims getAllClaims(String token){
        return Jwts
            .parserBuilder()
            .setSigningKey(SECRET_KEY)
            .build()
            .parseClaimsJws(token)
            .getBody();
    }

    public <T> T getClaim(String token, Function<Claims,T> claimsResolver){
        final Claims claims = getAllClaims(token);
        return claimsResolver.apply(claims);
    }

    private Date getExpiration(String token){
        return getClaim(token, Claims::getExpiration);
    }

    private boolean isTokenExpired(String token){
        return getExpiration(token).before(new Date());
    }

}
