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
        'http_status',
        'order_count_after',
        'attempted_at',
    ];

    protected $casts = [
        'attempted_at' => 'datetime',
    ];
}
