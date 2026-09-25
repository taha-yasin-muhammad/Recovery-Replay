<?php

test('demo page is accessible in testing environment', function () {
    $this->withoutVite();

    $response = $this->get('/demo');

    $response->assertStatus(200);
    $response->assertInertia(fn ($page) => $page->component('demo'));
});

test('demo page returns 403 in production environment', function () {
    $this->app->detectEnvironment(fn () => 'production');

    $response = $this->get('/demo');

    $response->assertStatus(403);
});
