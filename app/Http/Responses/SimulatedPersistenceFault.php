<?php

namespace App\Http\Responses;

use Illuminate\Http\JsonResponse;

/**
 * Concise JSON body for a deterministic post-persistence fault.
 * Callers must persist and record evidence before returning this response.
 */
final class SimulatedPersistenceFault
{
    public static function json(): JsonResponse
    {
        return response()->json([
            'message' => 'Simulated server fault after persistence',
            'error' => 'service_unavailable',
        ], 503);
    }
}
