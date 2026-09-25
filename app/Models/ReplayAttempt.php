<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReplayAttempt extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'run_id',
        'attempt_id',
        'operation_id',
        'order_id',
        'resource_type',
        'resource_id',
        'http_status',
        'order_count_after',
        'attempted_at',
    ];

    protected $casts = [
        'order_id' => 'integer',
        'resource_id' => 'integer',
        'http_status' => 'integer',
        'order_count_after' => 'integer',
        'attempted_at' => 'datetime',
    ];
}
