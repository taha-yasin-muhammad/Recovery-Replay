<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReplayComparison extends Model
{
    public $timestamps = false;

    protected $primaryKey = 'comparison_id';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'comparison_id',
        'resource_type',
        'before_run_id',
        'after_run_id',
        'created_at',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];
}
